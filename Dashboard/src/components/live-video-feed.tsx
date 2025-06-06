'use client';

import { useRef, useEffect, useState } from 'react';
import { Room, RoomEvent, RemoteTrack, Track, ConnectionState, RemoteParticipant } from 'livekit-client';
import { CameraIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface LiveVideoFeedProps {
    onVideoElementReady?: (videoElement: HTMLVideoElement | null) => void;
    room?: Room | null;
    isConnected?: boolean;
    videoTrack?: RemoteTrack | null;
    audioTrack?: RemoteTrack | null;
    isLoading?: boolean;
    connectionError?: string | null;
    participantIdentity?: string;
    remoteParticipants?: RemoteParticipant[];
}

export function LiveVideoFeed({
    onVideoElementReady,
    room,
    isConnected = false,
    videoTrack = null,
    audioTrack = null,
    isLoading = true,
    connectionError = null,
    participantIdentity = '',
    remoteParticipants = []
}: LiveVideoFeedProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoTrack && videoRef.current) {
            videoTrack.attach(videoRef.current);
            // Notify parent component that video element is ready
            onVideoElementReady?.(videoRef.current);
        }
    }, [videoTrack, onVideoElementReady]);

    const renderLoadingState = () => (
        <div className="w-full h-full min-h-[200px] bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    const renderOfflineState = () => (
        <div className="relative w-full h-full min-h-[200px] bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">
            <XCircleIcon className="w-12 h-12 text-red-500" />
            <div className="absolute top-2 right-2">
                <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                    OFFLINE
                </span>
            </div>
        </div>
    );

    const renderVideoState = () => (
        <div className="relative w-full h-full min-h-[200px] bg-gray-200 rounded-lg">
            {videoTrack ? (
                <video
                    ref={videoRef}
                    className="w-full h-full object-cover rounded-lg"
                    autoPlay
                    playsInline
                    muted
                />
            ) : (
                <div className="w-full h-full min-h-[200px] bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">
                    <div className="text-center">
                        <CameraIcon className="w-12 h-12 mx-auto mb-2" />
                        <p className="text-sm">No video feed</p>
                    </div>
                </div>
            )}

            {audioTrack && (
                <audio
                    ref={(el) => {
                        if (el && audioTrack) {
                            audioTrack.attach(el);
                        }
                    }}
                    autoPlay
                />
            )}

            <div className="absolute top-2 right-2">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${videoTrack
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                    }`}>
                    {videoTrack ? 'Live' : 'Offline'}
                </span>
            </div>
        </div>
    );

    const getConnectionStatus = () => {
        if (isLoading) return 'Connecting';
        return isConnected ? 'Connected' : 'Disconnected';
    };

    const getConnectionColor = () => {
        if (isLoading) return 'blue';
        return isConnected ? 'green' : 'red';
    };

    return (
        <div className="w-full h-full min-h-[200px]">
            {isLoading ? renderLoadingState() : (isConnected ? renderVideoState() : renderOfflineState())}
        </div>
    );
} 