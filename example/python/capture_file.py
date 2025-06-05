#!/usr/bin/env -S uv run --script
# /// script
# dependencies = [
#   "opencv-python",
#   "numpy",
#   "ArducamDepthCamera",
# ]
# ///
import cv2
import numpy as np
import ArducamDepthCamera as ac
import time


def main():
    print("Arducam Depth Camera Demo - Save to File.")
    print("  SDK version:", ac.__version__)

    cam = ac.ArducamCamera()
    cfg_path = None
    # cfg_path = "file.cfg"

    ret = 0
    if cfg_path is not None:
        ret = cam.openWithFile(cfg_path, 0)
    else:
        ret = cam.open(ac.Connection.CSI, 0)
    if ret != 0:
        print("initialization failed. Error code:", ret)
        return

    ret = cam.start(ac.FrameType.RAW)
    if ret != 0:
        print("Failed to start camera. Error code:", ret)
        cam.close()
        return

    frame_count = 0
    max_frames = 10  # Capture 10 frames, adjust as needed
    
    print(f"Capturing {max_frames} frames...")
    
    while frame_count < max_frames:
        frame = cam.requestFrame(2000)
        if frame is not None and isinstance(frame, ac.RawData):
            buf = frame.raw_data
            cam.releaseFrame(frame)

            buf = (buf / (1 << 4)).astype(np.uint8)

            # Generate filename with timestamp and frame number
            timestamp = int(time.time() * 1000)  # milliseconds
            filename = f"capture_{timestamp}_{frame_count:03d}.png"
            
            # Save image to file
            success = cv2.imwrite(filename, buf)
            if success:
                print(f"Saved frame {frame_count + 1}/{max_frames}: {filename}")
            else:
                print(f"Failed to save frame {frame_count + 1}")
            
            frame_count += 1
            
            # Small delay between captures
            time.sleep(0.1)

    print("Capture complete!")
    cam.stop()
    cam.close()


if __name__ == "__main__":
    main() 