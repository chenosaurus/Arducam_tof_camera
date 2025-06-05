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
import cv2
import numpy as np
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


def getPreviewGrayscale(preview: np.ndarray, confidence: np.ndarray) -> np.ndarray:
    """Apply confidence filtering to the grayscale depth image"""
    preview = np.nan_to_num(preview)
    preview[confidence < confidence_threshold] = 0
    return preview


class DepthCameraStreamer:
    def __init__(self, room: rtc.Room, logger: logging.Logger):
        self.room = room
        self.logger = logger
        self.cam = None
        self.video_source = None
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
    
    async def setup_video_track(self):
        """Setup video track for streaming"""
        try:
            # Create a video source
            self.video_source = rtc.VideoSource(640, 480)  # Adjust resolution as needed
            track = rtc.LocalVideoTrack.create_video_track("depth_camera", self.video_source)
            
            # Publish the video track
            options = rtc.TrackPublishOptions()
            options.source = rtc.TrackSource.SOURCE_CAMERA
            
            publication = await self.room.local_participant.publish_track(track, options)
            self.logger.info(f"Published video track: {publication.sid}")
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error setting up video track: {e}")
            return False
    
    async def capture_and_stream(self):
        """Main capture and streaming loop"""
        self.is_streaming = True
        frame_interval = 1.0 / FPS  # Time between frames for 10fps
        
        self.logger.info(f"Starting depth camera stream at {FPS} fps")
        
        try:
            while self.is_streaming and self.room.connection_state == rtc.ConnectionState.CONN_CONNECTED:
                start_time = asyncio.get_event_loop().time()
                
                # Capture frame from camera
                frame = self.cam.requestFrame(2000)  # 2 second timeout
                
                if frame is not None and isinstance(frame, ac.DepthData):
                    try:
                        # Get depth and confidence data
                        depth_buf = frame.depth_data
                        confidence_buf = frame.confidence_data
                        
                        # Release frame immediately after copying data
                        self.cam.releaseFrame(frame)
                        
                        # Process depth data
                        range_value = self.cam.getControl(ac.Control.RANGE)
                        grayscale_image = (depth_buf * (255.0 / range_value)).astype(np.uint8)
                        
                        # Apply confidence filtering
                        if confidence_buf is not None:
                            grayscale_image = getPreviewGrayscale(grayscale_image, confidence_buf)
                        
                        # Convert grayscale to RGB for video streaming
                        rgb_image = cv2.cvtColor(grayscale_image, cv2.COLOR_GRAY2RGB)
                        
                        # Create video frame and push to source
                        if self.video_source:
                            # Get the height and width from the image
                            height, width = rgb_image.shape[:2]
                            
                            # Convert to RGBA format for VideoFrame
                            rgba_image = cv2.cvtColor(rgb_image, cv2.COLOR_RGB2RGBA)
                            
                            # Create video frame using the correct constructor
                            video_frame = rtc.VideoFrame(width, height, rtc.VideoBufferType.RGBA, rgba_image.tobytes())
                            self.video_source.capture_frame(video_frame)
                            
                    except Exception as e:
                        self.logger.error(f"Error processing frame: {e}")
                else:
                    self.logger.warning("Failed to capture frame from camera")
                
                # Calculate sleep time to maintain target FPS
                elapsed_time = asyncio.get_event_loop().time() - start_time
                sleep_time = max(0, frame_interval - elapsed_time)
                
                if sleep_time > 0:
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
    
    # Create the depth camera streamer
    streamer = DepthCameraStreamer(room, logger)
    
    # Initialize camera
    if not await streamer.initialize_camera():
        logger.error("Failed to initialize camera, exiting")
        return
    
    # Connect to LiveKit room
    token = generate_token(ROOM_NAME, "depth_camera", "Depth Camera Streamer")
    await room.connect(LIVEKIT_URL, token, rtc.RoomOptions(auto_subscribe=False))
    logger.info("Connected to room %s", room.name)
    
    # Setup video track
    if not await streamer.setup_video_track():
        logger.error("Failed to setup video track, exiting")
        streamer.stop_streaming()
        return
    
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
            logging.FileHandler("depth_camera_stream.log"),
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