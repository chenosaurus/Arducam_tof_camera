#!/usr/bin/env -S uv run --script
# /// script
# dependencies = [
#   "livekit",
#   "livekit_api",
#   "opencv-python",
#   "numpy",
#   "ArducamDepthCamera",
#   "python-dotenv",
#   "asyncio",
# ]
# ///

import os
import logging
import asyncio
import json
import struct
import numpy as np
import cv2
import ArducamDepthCamera as ac
from dotenv import load_dotenv
from signal import SIGINT, SIGTERM
from livekit import rtc
from auth import generate_token

load_dotenv()
# ensure LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are set in your .env file
LIVEKIT_URL = os.environ.get("LIVEKIT_URL")
ROOM_NAME = os.environ.get("ROOM_NAME")

# Camera settings
MAX_DISTANCE = 4000
confidence_threshold = 30
FPS = 10  # 10 fps as requested


class DepthCameraDataStreamer:
    def __init__(self, room: rtc.Room, logger: logging.Logger):
        self.room = room
        self.logger = logger
        self.cam = None
        self.is_streaming = False
        
    async def initialize_camera(self):
        """Initialize the Arducam depth camera"""
        try:
            self.cam = ac.ArducamCamera()
            cfg_path = None  # Can be set to a config file path if needed
            
            if cfg_path is not None:
                ret = self.cam.openWithFile(cfg_path, 0)
            else:
                ret = self.cam.open(ac.Connection.CSI, 0)
                
            if ret != 0:
                self.logger.error(f"Camera initialization failed. Error code: {ret}")
                return False
                
            ret = self.cam.start(ac.FrameType.DEPTH)
            if ret != 0:
                self.logger.error(f"Failed to start camera. Error code: {ret}")
                self.cam.close()
                return False
                
            # Set the range control
            self.cam.setControl(ac.Control.RANGE, MAX_DISTANCE)
            range_value = self.cam.getControl(ac.Control.RANGE)
            self.logger.info(f"Camera range set to: {range_value}")
            
            info = self.cam.getCameraInfo()
            self.logger.info(f"Camera resolution: {info.width}x{info.height}")
            self.logger.info(f"Device type: {info.device_type}")
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error initializing camera: {e}")
            return False
    
    def serialize_frame_data(self, depth_data: np.ndarray, confidence_data: np.ndarray, camera_info: dict) -> bytes:
        """Serialize depth frame data as PNG bytes for transmission"""
        try:
            # Encode depth data as 8-bit single-channel PNG for smaller size
            # Normalize depth data to 8-bit range (0-255)
            depth_normalized = np.clip(depth_data, 0, camera_info["max_distance"])
            depth_8bit = (depth_normalized * 255 / camera_info["max_distance"]).astype(np.uint8)
            
            # Encode as single-channel PNG with moderate compression for speed
            success, depth_png = cv2.imencode('.png', depth_8bit, [cv2.IMWRITE_PNG_COMPRESSION, 6])
            if not success:
                self.logger.error("Failed to encode depth data as PNG")
                return b''
            
            return depth_png.tobytes()
            
        except Exception as e:
            self.logger.error(f"Error serializing frame data: {e}")
            return b''
    
    async def capture_and_stream(self):
        """Main capture and streaming loop"""
        self.is_streaming = True
        frame_interval = 1.0 / FPS  # Time between frames for 10fps
        
        self.logger.info(f"Starting depth camera data stream at {FPS} fps")
        
        try:
            info = self.cam.getCameraInfo()
            camera_info = {
                "width": info.width,
                "height": info.height,
                "max_distance": MAX_DISTANCE
            }
            self.logger.info(f"Camera info: {camera_info}")
            
            frame_count = 0
            failed_publishes = 0
            max_consecutive_failures = 5
            
            while self.is_streaming and self.room.connection_state == rtc.ConnectionState.CONN_CONNECTED:
                start_time = asyncio.get_event_loop().time()
                
                # Check connection health
                if failed_publishes >= max_consecutive_failures:
                    self.logger.error(f"Too many consecutive publish failures ({failed_publishes}), stopping stream")
                    break
                
                try:
                    # Capture frame from camera
                    self.logger.debug(f"Requesting frame {frame_count}")
                    frame = self.cam.requestFrame(2000)  # 2 second timeout
                    
                    if frame is not None and isinstance(frame, ac.DepthData):
                        try:
                            # Get depth and confidence data
                            depth_buf = frame.depth_data
                            confidence_buf = frame.confidence_data
                            
                            # Release frame immediately after copying data
                            self.cam.releaseFrame(frame)
                            
                            # Serialize the data
                            self.logger.debug(f"Serializing frame {frame_count}")
                            serialized_data = self.serialize_frame_data(depth_buf, confidence_buf, camera_info)
                            
                            if serialized_data:
                                # log data size in bytes
                                self.logger.info(f"Data size: {len(serialized_data)} bytes")
                                
                                # Publish data to room with timeout - using unreliable for better performance
                                self.logger.debug(f"Publishing frame {frame_count}")
                                try:
                                    await asyncio.wait_for(
                                        self.room.local_participant.publish_data(
                                            serialized_data,
                                            reliable=False,  # Use unreliable for better performance with large data
                                        ),
                                        timeout=2.0  # Reduced timeout to 2 seconds
                                    )
                                    self.logger.debug(f"Successfully published frame {frame_count}")
                                    failed_publishes = 0  # Reset failure counter on success
                                except asyncio.TimeoutError:
                                    failed_publishes += 1
                                    self.logger.warning(f"Timeout publishing frame {frame_count} (failures: {failed_publishes})")
                                except Exception as e:
                                    failed_publishes += 1
                                    self.logger.warning(f"Error publishing frame {frame_count}: {e} (failures: {failed_publishes})")
                                
                        except Exception as e:
                            self.logger.error(f"Error processing frame {frame_count}: {e}")
                            # Make sure to release frame even on error
                            try:
                                self.cam.releaseFrame(frame)
                            except:
                                pass
                    else:
                        self.logger.warning(f"Failed to capture frame {frame_count} from camera")
                    
                    frame_count += 1
                    
                except Exception as e:
                    self.logger.error(f"Error in frame capture {frame_count}: {e}")
                
                # Calculate sleep time to maintain target FPS
                elapsed_time = asyncio.get_event_loop().time() - start_time
                sleep_time = max(0, frame_interval - elapsed_time)
                
                if sleep_time > 0:
                    self.logger.debug(f"Sleeping for {sleep_time:.3f}s")
                    await asyncio.sleep(sleep_time)
                    
        except Exception as e:
            self.logger.error(f"Error in capture loop: {e}")
        finally:
            self.is_streaming = False
    
    def stop_streaming(self):
        """Stop the streaming process"""
        self.is_streaming = False
        if self.cam:
            self.cam.stop()
            self.cam.close()
            self.logger.info("Camera stopped and closed")


async def main(room: rtc.Room):
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    # Create the depth camera data streamer
    streamer = DepthCameraDataStreamer(room, logger)
    
    # Initialize camera
    if not await streamer.initialize_camera():
        logger.error("Failed to initialize camera, exiting")
        return
    
    # Connect to LiveKit room
    token = generate_token(ROOM_NAME, "depth_camera_data", "Depth Camera Data Streamer")
    await room.connect(LIVEKIT_URL, token, rtc.RoomOptions(auto_subscribe=False))
    logger.info("Connected to room %s", room.name)
    
    # Start streaming
    streaming_task = asyncio.create_task(streamer.capture_and_stream())
    
    # Handle room disconnection
    @room.on("disconnected")
    def on_disconnected():
        logger.info("Disconnected from room")
        streamer.stop_streaming()
    
    # Wait for streaming to complete
    try:
        await streaming_task
    except Exception as e:
        logger.error(f"Streaming error: {e}")
    finally:
        streamer.stop_streaming()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        handlers=[
            logging.FileHandler("depth_camera_data_stream.log"),
            logging.StreamHandler(),
        ],
    )

    loop = asyncio.get_event_loop()
    room = rtc.Room(loop=loop)

    async def cleanup():
        await room.disconnect()
        loop.stop()

    asyncio.ensure_future(main(room))
    for signal in [SIGINT, SIGTERM]:
        loop.add_signal_handler(signal, lambda: asyncio.ensure_future(cleanup()))

    try:
        loop.run_forever()
    finally:
        loop.close() 