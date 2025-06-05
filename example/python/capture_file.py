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

# MAX_DISTANCE value modifiable is 2000 or 4000
MAX_DISTANCE = 4000
confidence_threshold = 30


def getPreviewGrayscale(preview: np.ndarray, confidence: np.ndarray) -> np.ndarray:
    """Apply confidence filtering to the grayscale depth image"""
    preview = np.nan_to_num(preview)
    preview[confidence < confidence_threshold] = 0
    return preview


def main():
    print("Arducam Depth Camera Demo - Save Single Image to File.")
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

    ret = cam.start(ac.FrameType.DEPTH)
    if ret != 0:
        print("Failed to start camera. Error code:", ret)
        cam.close()
        return

    # Set the range control
    cam.setControl(ac.Control.RANGE, MAX_DISTANCE)
    
    # Get the actual range value
    range_value = cam.getControl(ac.Control.RANGE)
    print(f"Camera range set to: {range_value}")

    info = cam.getCameraInfo()
    print(f"Camera resolution: {info.width}x{info.height}")
    print(f"Device type: {info.device_type}")

    print("Capturing single frame...")
    
    frame = cam.requestFrame(2000)
    if frame is not None and isinstance(frame, ac.DepthData):
        # Get depth and confidence data
        depth_buf = frame.depth_data
        confidence_buf = frame.confidence_data
        
        # Release frame immediately after copying data
        cam.releaseFrame(frame)

        # Process depth data similar to preview_depth.py
        # Convert depth to 8-bit grayscale (0-255 range)
        grayscale_image = (depth_buf * (255.0 / range_value)).astype(np.uint8)
        
        # Apply confidence filtering
        if confidence_buf is not None:
            grayscale_image = getPreviewGrayscale(grayscale_image, confidence_buf)

        # Generate filename with timestamp
        timestamp = int(time.time() * 1000)  # milliseconds
        filename = f"depth_capture_{timestamp}.png"
        
        # Save grayscale image to file
        success = cv2.imwrite(filename, grayscale_image)
        if success:
            print(f"Successfully saved: {filename}")
        else:
            print("Failed to save image")
    else:
        print("Failed to capture frame")

    print("Capture complete!")
    cam.stop()
    cam.close()


if __name__ == "__main__":
    main() 