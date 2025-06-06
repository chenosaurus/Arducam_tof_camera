'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { RemoteTrack } from 'livekit-client';

// Interface for joint angles (matching the one in robot-arm-3d.tsx)
interface JointAngles {
    base: number | null;      // J1 - Base rotation
    shoulder: number | null;  // J2 - Shoulder pitch
    elbow: number | null;     // J3 - Elbow pitch
    wrist1: number | null;    // J4 - Wrist roll
    wrist2: number | null;    // J5 - Wrist pitch
    wrist3: number | null;    // J6 - Wrist yaw
}

// Dynamically import the RobotArm3D component with SSR disabled
const RobotArm3D = dynamic(() => import('./robot-arm-3d').then(mod => ({ default: mod.RobotArm3D })), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black rounded-lg overflow-hidden flex items-center justify-center">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <div className="text-gray-400">Loading 3D Visualization...</div>
                <div className="text-gray-600 text-sm mt-2">Initializing Robot Arm</div>
            </div>
        </div>
    )
});

export function RobotArm3DWrapper({ videoElement, robotArmVideoElement, robotArmVideoTrack, jointAngles }: {
    videoElement?: HTMLVideoElement | null;
    robotArmVideoElement?: HTMLVideoElement | null;
    robotArmVideoTrack?: RemoteTrack | null;
    jointAngles?: JointAngles;
} = {}) {
    return (
        <Suspense fallback={
            <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black rounded-lg overflow-hidden flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <div className="text-gray-400">Loading 3D Visualization...</div>
                    <div className="text-gray-600 text-sm mt-2">Initializing Robot Arm</div>
                </div>
            </div>
        }>
            <RobotArm3D
                videoElement={robotArmVideoElement || videoElement}
                hasActiveVideoTrack={!!robotArmVideoTrack}
                jointAngles={jointAngles}
            />
        </Suspense>
    );
} 