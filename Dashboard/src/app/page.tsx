'use client';

import {
  CogIcon,
  ChartBarIcon,
  CameraIcon,
  UserIcon,
  HomeIcon,
  CubeIcon,
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  XCircleIcon
} from "@heroicons/react/24/outline";
import { useState, useEffect } from "react";
import { Room, RoomEvent, RemoteTrack, Track, ConnectionState, RemoteParticipant, DataPacket_Kind } from 'livekit-client';
import Image from "next/image";
import Link from "next/link";
import { LiveVideoFeed } from "@/components/live-video-feed";
import { RobotArm3DWrapper } from "@/components/robot-arm-3d-wrapper";

// Interface for robot arm position data
interface RobotArmPosition {
  timestamp: number;
  jointAngles: {
    base: number;      // J1 - Base rotation
    shoulder: number;  // J2 - Shoulder pitch
    elbow: number;     // J3 - Elbow pitch
    wrist1: number;    // J4 - Wrist roll
    wrist2: number;    // J5 - Wrist pitch
    wrist3: number;    // J6 - Wrist yaw
  };
  status?: {
    base: 'active' | 'inactive' | 'error' | 'offline';
    shoulder: 'active' | 'inactive' | 'error' | 'offline';
    elbow: 'active' | 'inactive' | 'error' | 'offline';
    wrist1: 'active' | 'inactive' | 'error' | 'offline';
    wrist2: 'active' | 'inactive' | 'error' | 'offline';
    wrist3: 'active' | 'inactive' | 'error' | 'offline';
  };
}

// Interface for incoming leader data format
interface LeaderArmData {
  leader_arm_positions: {
    right: number[]; // Array of 6 joint angles
  };
}

export default function LandingPage() {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [robotArmVideoElement, setRobotArmVideoElement] = useState<HTMLVideoElement | null>(null);

  // LiveKit room state
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Separate tracks for each camera
  const [robotCamVideoTrack, setRobotCamVideoTrack] = useState<RemoteTrack | null>(null);
  const [robotArmCamVideoTrack, setRobotArmCamVideoTrack] = useState<RemoteTrack | null>(null);
  const [audioTrack, setAudioTrack] = useState<RemoteTrack | null>(null);

  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [participantIdentity, setParticipantIdentity] = useState<string>('');
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);

  // Robotic arm joint angles (in degrees) - now updated from LiveKit
  const [jointAngles, setJointAngles] = useState({
    base: null as number | null,      // J1 - Base rotation
    shoulder: null as number | null,  // J2 - Shoulder pitch
    elbow: null as number | null,     // J3 - Elbow pitch
    wrist1: null as number | null,    // J4 - Wrist roll
    wrist2: null as number | null,    // J5 - Wrist pitch
    wrist3: null as number | null     // J6 - Wrist yaw
  });

  // Joint status tracking
  const [jointStatus, setJointStatus] = useState({
    base: 'offline' as 'active' | 'inactive' | 'error' | 'offline',
    shoulder: 'offline' as 'active' | 'inactive' | 'error' | 'offline',
    elbow: 'offline' as 'active' | 'inactive' | 'error' | 'offline',
    wrist1: 'offline' as 'active' | 'inactive' | 'error' | 'offline',
    wrist2: 'offline' as 'active' | 'inactive' | 'error' | 'offline',
    wrist3: 'offline' as 'active' | 'inactive' | 'error' | 'offline',
  });

  // Track last position update time
  const [lastPositionUpdate, setLastPositionUpdate] = useState<number | null>(null);
  const [positionDataStale, setPositionDataStale] = useState(false);

  const handleVideoElementReady = (element: HTMLVideoElement | null) => {
    setVideoElement(element);
  };

  const handleRobotArmVideoElementReady = (element: HTMLVideoElement | null) => {
    setRobotArmVideoElement(element);
  };

  // Handle incoming robot arm position data from LiveKit
  const handleRobotArmPositionData = (data: RobotArmPosition) => {
    console.log('=== UPDATING UI STATE ===');
    console.log('Received robot arm position data:', data);

    // Update joint angles
    console.log('Previous joint angles:', jointAngles);
    setJointAngles(data.jointAngles);
    console.log('Setting new joint angles:', data.jointAngles);

    // Update joint status if provided
    if (data.status) {
      console.log('Previous joint status:', jointStatus);
      setJointStatus(data.status);
      console.log('Setting new joint status:', data.status);
    }

    // Update timestamp tracking
    console.log('Previous timestamp:', lastPositionUpdate);
    setLastPositionUpdate(data.timestamp);
    console.log('Setting new timestamp:', data.timestamp);

    setPositionDataStale(false);
    console.log('Marked position data as fresh (not stale)');
    console.log('=== END UPDATING UI STATE ===');
  };

  // Parse leader arm data format and convert to RobotArmPosition
  const parseLeaderArmData = (leaderData: LeaderArmData): RobotArmPosition => {
    console.log('=== PARSING LEADER DATA ===');
    console.log('Input leaderData:', leaderData);

    // Check if leader_arm_positions exists
    if (!leaderData.leader_arm_positions) {
      console.error('Missing leader_arm_positions in data');
      throw new Error('Missing leader_arm_positions in data');
    }

    // Check if right arm data exists
    if (!leaderData.leader_arm_positions.right) {
      console.error('Missing right arm data in leader_arm_positions');
      throw new Error('Missing right arm data in leader_arm_positions');
    }

    const rightArmPositions = leaderData.leader_arm_positions.right;
    console.log('Right arm positions array:', rightArmPositions);
    console.log('Array length:', rightArmPositions.length);
    console.log('Array values:', rightArmPositions.map((val, idx) => `[${idx}]: ${val}`));

    // Ensure we have exactly 6 joint angles
    if (rightArmPositions.length !== 6) {
      console.error(`Expected 6 joint angles, got ${rightArmPositions.length}`);
      throw new Error(`Expected 6 joint angles, got ${rightArmPositions.length}`);
    }

    // Map array indices to joint names
    const mappedJoints = {
      base: rightArmPositions[0],      // J1 - Base rotation
      shoulder: rightArmPositions[1],  // J2 - Shoulder pitch
      elbow: rightArmPositions[2],     // J3 - Elbow pitch
      wrist1: rightArmPositions[3],    // J4 - Wrist roll
      wrist2: rightArmPositions[4],    // J5 - Wrist pitch
      wrist3: rightArmPositions[5]     // J6 - Wrist yaw
    };

    console.log('Mapped joint angles:');
    Object.entries(mappedJoints).forEach(([joint, angle]) => {
      console.log(`  ${joint}: ${angle}°`);
    });

    const result: RobotArmPosition = {
      timestamp: Date.now(),
      jointAngles: mappedJoints,
      // Set all joints as active since we're receiving live data
      status: {
        base: 'active',
        shoulder: 'active',
        elbow: 'active',
        wrist1: 'active',
        wrist2: 'active',
        wrist3: 'active'
      }
    };

    console.log('Final RobotArmPosition result:', result);
    console.log('=== END PARSING LEADER DATA ===');

    return result;
  };

  useEffect(() => {
    const roomInstance = new Room();
    setRoom(roomInstance);

    const connectToRoom = async () => {
      try {
        setConnectionError(null);
        setIsLoading(true);

        // Fetch token and server URL from API
        const response = await fetch('/api/video-token');
        if (!response.ok) {
          throw new Error('Failed to fetch LiveKit credentials');
        }

        const { token, serverUrl, identity, roomName } = await response.json();
        console.log('Fetched credentials:', { serverUrl, identity, roomName });

        if (!token || !serverUrl) {
          throw new Error('Invalid LiveKit credentials');
        }

        setParticipantIdentity(identity);

        // Set up event listeners before connecting
        roomInstance.on(RoomEvent.Connected, () => {
          console.log('LiveKit room connected successfully');
          console.log('Connected participants:', roomInstance.participants.size);
          console.log('Room name:', roomInstance.name);
          console.log('Local participant identity:', roomInstance.localParticipant?.identity);
          setIsConnected(true);
          setIsLoading(false);
        });

        // Debug: Log all room events
        roomInstance.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
          console.log('Participant connected:', participant.identity);
          console.log('Total participants now:', roomInstance.participants.size + 1);
        });

        roomInstance.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          console.log('Participant disconnected:', participant.identity);
          // Clear tracks when specific participants disconnect
          if (participant.identity === 'robot_cam') {
            setRobotCamVideoTrack(null);
          } else if (participant.identity === 'robot_arm_cam') {
            setRobotArmCamVideoTrack(null);
          }

          // Mark position data as stale if robot controller disconnects
          if (participant.identity === 'robot_controller') {
            setPositionDataStale(true);
          }
        });

        roomInstance.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant) => {
          console.log('Track subscribed:', track.kind, 'from', participant.identity);
          if (track.kind === Track.Kind.Video) {
            if (participant.identity === 'robot_cam') {
              setRobotCamVideoTrack(track);
            } else if (participant.identity === 'robot_arm_cam') {
              setRobotArmCamVideoTrack(track);
            }
          } else if (track.kind === Track.Kind.Audio) {
            setAudioTrack(track);
          }
        });

        roomInstance.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication, participant) => {
          console.log('Track unsubscribed:', track.kind, 'from', participant.identity);
          if (track.kind === Track.Kind.Video) {
            if (participant.identity === 'robot_cam') {
              setRobotCamVideoTrack(null);
              track.detach();
            } else if (participant.identity === 'robot_arm_cam') {
              setRobotArmCamVideoTrack(null);
              track.detach();
            }
          } else if (track.kind === Track.Kind.Audio) {
            setAudioTrack(null);
            track.detach();
          }
        });

        roomInstance.on(RoomEvent.Disconnected, () => {
          console.log('Disconnected from room');
          setIsConnected(false);
          setRobotCamVideoTrack(null);
          setRobotArmCamVideoTrack(null);
          setAudioTrack(null);
          setRemoteParticipants([]);
          setPositionDataStale(true);
        });

        roomInstance.on(RoomEvent.TrackPublished, (publication, participant) => {
          console.log('Track published:', publication.kind, 'by', participant.identity);
        });

        // Additional debugging for data events
        console.log('Setting up DataReceived event listener...');

        // Handle incoming data messages for robot arm positions
        roomInstance.on(RoomEvent.DataReceived, (payload: Uint8Array, participant, kind, topic) => {
          console.log('=== DATA RECEIVED DEBUG ===');
          console.log('Participant:', participant?.identity);
          console.log('Topic:', topic);
          console.log('Kind:', kind);
          console.log('Payload size:', payload.length);

          try {
            // Check if this is depth camera data (likely from 'depth_camera_data' participant)
            if (participant?.identity === 'depth_camera_data') {
              console.log('=== DEPTH CAMERA DATA RECEIVED ===');
              console.log('Received depth camera frame data');
              console.log('Data size:', payload.length, 'bytes');

              // For now, just log that we received the data
              // Later we can deserialize and process the depth frame
              console.log('First 20 bytes of payload:', Array.from(payload.slice(0, 20)));
              console.log('=== END DEPTH CAMERA DATA ===');
            }
            // Handle robot arm position data (existing logic)
            else {
              const decoder = new TextDecoder();
              const jsonString = decoder.decode(payload);
              console.log('Raw data string:', jsonString);

              // Try to parse as JSON first
              let parsedData;
              try {
                parsedData = JSON.parse(jsonString);
                console.log('Parsed JSON data:', parsedData);
              } catch (parseError) {
                console.error('Failed to parse as JSON:', parseError);
                return;
              }

              // Handle leader arm position data (specific topic)
              if (topic === 'leader') {
                console.log('Processing leader topic data...');
                const leaderData: LeaderArmData = parsedData;
                console.log('Leader data structure:', leaderData);

                // Convert leader data format to our internal format
                const positionData = parseLeaderArmData(leaderData);
                console.log('Converted position data:', positionData);
                handleRobotArmPositionData(positionData);
              }
              // Fallback: check if data contains leader_arm_positions regardless of topic
              else if (parsedData.leader_arm_positions) {
                console.log('Found leader_arm_positions in data (fallback), topic was:', topic);
                const leaderData: LeaderArmData = parsedData;
                const positionData = parseLeaderArmData(leaderData);
                handleRobotArmPositionData(positionData);
              }
              // Log any other data for debugging
              else {
                console.log('Received data that does not match expected format:');
                console.log('- Topic:', topic);
                console.log('- Data keys:', Object.keys(parsedData));
                console.log('- Full data:', parsedData);
              }
            }
          } catch (error) {
            console.error('Error processing data received event:', error);
            console.error('Raw payload bytes:', Array.from(payload.slice(0, 100))); // First 100 bytes
          }
          console.log('=== END DATA RECEIVED DEBUG ===');
        });

        // Connect to the room
        console.log('Attempting to connect to LiveKit room...');
        await roomInstance.connect(serverUrl, token);
        console.log('Room connection initiated');

      } catch (error) {
        console.error('Failed to connect to LiveKit room:', error);
        setConnectionError(error instanceof Error ? error.message : 'Connection failed');
        setIsConnected(false);
        setIsLoading(false);
      }
    };

    connectToRoom();

    return () => {
      console.log('Cleaning up room connection');
      roomInstance.disconnect();
    };
  }, []);

  // Check for stale position data
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastPositionUpdate && Date.now() - lastPositionUpdate > 5000) {
        setPositionDataStale(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastPositionUpdate]);

  // Helper function to get joint status color and text
  const getJointStatusDisplay = (status: 'active' | 'inactive' | 'error' | 'offline', isStale: boolean) => {
    if (isStale) {
      return {
        color: 'bg-yellow-100 text-yellow-700',
        text: 'Stale'
      };
    }

    switch (status) {
      case 'active':
        return {
          color: 'bg-green-100 text-green-700',
          text: 'Active'
        };
      case 'inactive':
        return {
          color: 'bg-gray-100 text-gray-700',
          text: 'Inactive'
        };
      case 'error':
        return {
          color: 'bg-red-100 text-red-700',
          text: 'Error'
        };
      case 'offline':
        return {
          color: 'bg-gray-100 text-gray-700',
          text: 'Offline'
        };
      default:
        return {
          color: 'bg-gray-100 text-gray-700',
          text: 'Unknown'
        };
    }
  };

  return (
    <div className="h-screen bg-white text-gray-900 flex overflow-hidden">
      {/* Sidebar Navigation */}
      <div className="w-16 bg-gray-50 border-r border-gray-200 flex flex-col items-center py-6 space-y-6 shadow-sm">
        <div className="w-8 h-8 flex items-center justify-center">
          <Image
            src="/livekit-logo.svg"
            alt="LiveKit Logo"
            width={32}
            height={32}
            className="rounded-lg"
          />
        </div>
        <nav className="flex flex-col space-y-4">
          <button className="w-10 h-10 p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <HomeIcon className="w-full h-full" />
          </button>
          <button className="w-10 h-10 p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <CubeIcon className="w-full h-full" />
          </button>
          <button className="w-10 h-10 p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <ChartBarIcon className="w-full h-full" />
          </button>
          <button className="w-10 h-10 p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <CameraIcon className="w-full h-full" />
          </button>
          <button className="w-10 h-10 p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <UserIcon className="w-full h-full" />
          </button>
          <button className="w-10 h-10 p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <CogIcon className="w-full h-full" />
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 bg-white">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-semibold text-gray-900">
              Robot Station 0001
            </h1>
            <div className="flex gap-2 items-center">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <div className={`w-2 h-2 rounded-full ${positionDataStale ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
              <button className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                <InformationCircleIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex">
          {/* Left Panel - Robot Details */}
          <div className="w-80 bg-white border-r border-gray-200 p-6 overflow-y-auto">
            <div className="space-y-6">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-medium">Robot</p>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">SO-100 ARM</h2>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Serial number:</span>
                    <span className="text-gray-900 font-medium">SO-100-0001</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Online status:</span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {isConnected ? 'online' : 'offline'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Overall health status:</span>
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Healthy</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Position data:</span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${positionDataStale ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                      {positionDataStale ? 'Stale' : 'Live'}
                    </span>
                  </div>
                  {lastPositionUpdate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Last update:</span>
                      <span className="text-gray-900 font-medium">
                        {new Date(lastPositionUpdate).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>


            </div>
          </div>

          {/* Main Visualization Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Video Feed and 3D Visualization */}
            <div className="flex bg-white p-4 gap-4" style={{ height: '900px' }}>
              {/* Left Column - Video Feeds */}
              <div className="w-1/3 flex flex-col gap-4 h-full">
                {/* Robot Camera Feed */}
                <div className="flex-1 h-0">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 h-full flex flex-col">
                    <div className="mb-2 flex-shrink-0">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        Robot Camera
                      </p>
                    </div>
                    <div className="flex-1 rounded-lg overflow-hidden">
                      <LiveVideoFeed
                        onVideoElementReady={handleVideoElementReady}
                        room={room}
                        isConnected={isConnected}
                        videoTrack={robotCamVideoTrack}
                        audioTrack={audioTrack}
                        isLoading={isLoading}
                        connectionError={connectionError}
                        participantIdentity={participantIdentity}
                        remoteParticipants={remoteParticipants}
                      />
                    </div>
                  </div>
                </div>

                {/* Robot Arm Camera Feed */}
                <div className="flex-1 h-0">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 h-full flex flex-col">
                    <div className="mb-2 flex-shrink-0">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                        Robot Arm Camera
                      </p>
                    </div>
                    <div className="flex-1 rounded-lg overflow-hidden">
                      <LiveVideoFeed
                        onVideoElementReady={handleRobotArmVideoElementReady}
                        room={room}
                        isConnected={isConnected}
                        videoTrack={robotArmCamVideoTrack}
                        audioTrack={audioTrack}
                        isLoading={isLoading}
                        connectionError={connectionError}
                        participantIdentity={participantIdentity}
                        remoteParticipants={remoteParticipants}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - 3D Visualization */}
              <div className="w-2/3 h-full">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 h-full flex flex-col">
                  <div className="mb-2 flex-shrink-0">
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                      3D Visualization
                    </p>
                  </div>
                  <div className="flex-1 rounded-lg overflow-hidden">
                    <RobotArm3DWrapper
                      videoElement={videoElement}
                      robotArmVideoElement={robotArmVideoElement}
                      robotArmVideoTrack={robotArmCamVideoTrack}
                      jointAngles={jointAngles}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Module Status Cards */}
            <div className="bg-white p-4 border-t border-gray-200 flex-1 overflow-y-auto">
              <div className="mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Current State</h2>

              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                <div className="p-3 bg-white border border-gray-200 shadow-sm rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-gray-500 uppercase font-medium">Base Joint</p>
                      {(() => {
                        const status = getJointStatusDisplay(jointStatus.base, positionDataStale);
                        return status.text === 'Active' ?
                          <CheckCircleIcon className="w-4 h-4 text-green-500" /> :
                          <XCircleIcon className="w-4 h-4 text-red-500" />;
                      })()}
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">J1</h3>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Current angle:</span>
                        <span className="text-gray-900 font-medium text-lg">{jointAngles.base === null ? 'N/A' : jointAngles.base.toFixed(1)}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Joint status:</span>
                        {(() => {
                          const status = getJointStatusDisplay(jointStatus.base, positionDataStale);
                          return <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>{status.text}</span>;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white border border-gray-200 shadow-sm rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-gray-500 uppercase font-medium">Shoulder</p>
                      {(() => {
                        const status = getJointStatusDisplay(jointStatus.shoulder, positionDataStale);
                        return status.text === 'Active' ?
                          <CheckCircleIcon className="w-4 h-4 text-green-500" /> :
                          <XCircleIcon className="w-4 h-4 text-red-500" />;
                      })()}
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">J2</h3>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Current angle:</span>
                        <span className="text-gray-900 font-medium text-lg">{jointAngles.shoulder === null ? 'N/A' : jointAngles.shoulder.toFixed(1)}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Joint status:</span>
                        {(() => {
                          const status = getJointStatusDisplay(jointStatus.shoulder, positionDataStale);
                          return <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>{status.text}</span>;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white border border-gray-200 shadow-sm rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-gray-500 uppercase font-medium">Elbow</p>
                      {(() => {
                        const status = getJointStatusDisplay(jointStatus.elbow, positionDataStale);
                        return status.text === 'Active' ?
                          <CheckCircleIcon className="w-4 h-4 text-green-500" /> :
                          <XCircleIcon className="w-4 h-4 text-red-500" />;
                      })()}
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">J3</h3>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Current angle:</span>
                        <span className="text-gray-900 font-medium text-lg">{jointAngles.elbow === null ? 'N/A' : jointAngles.elbow.toFixed(1)}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Joint status:</span>
                        {(() => {
                          const status = getJointStatusDisplay(jointStatus.elbow, positionDataStale);
                          return <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>{status.text}</span>;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white border border-gray-200 shadow-sm rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-gray-500 uppercase font-medium">Wrist Pitch</p>
                      {(() => {
                        const status = getJointStatusDisplay(jointStatus.wrist1, positionDataStale);
                        return status.text === 'Active' ?
                          <CheckCircleIcon className="w-4 h-4 text-green-500" /> :
                          <XCircleIcon className="w-4 h-4 text-red-500" />;
                      })()}
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">J4</h3>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Current angle:</span>
                        <span className="text-gray-900 font-medium text-lg">{jointAngles.wrist1 === null ? 'N/A' : jointAngles.wrist1.toFixed(1)}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Joint status:</span>
                        {(() => {
                          const status = getJointStatusDisplay(jointStatus.wrist1, positionDataStale);
                          return <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>{status.text}</span>;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white border border-gray-200 shadow-sm rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-gray-500 uppercase font-medium">Wrist Roll</p>
                      {(() => {
                        const status = getJointStatusDisplay(jointStatus.wrist2, positionDataStale);
                        return status.text === 'Active' ?
                          <CheckCircleIcon className="w-4 h-4 text-green-500" /> :
                          <XCircleIcon className="w-4 h-4 text-red-500" />;
                      })()}
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">J5</h3>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Current angle:</span>
                        <span className="text-gray-900 font-medium text-lg">{jointAngles.wrist2 === null ? 'N/A' : jointAngles.wrist2.toFixed(1)}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Joint status:</span>
                        {(() => {
                          const status = getJointStatusDisplay(jointStatus.wrist2, positionDataStale);
                          return <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>{status.text}</span>;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white border border-gray-200 shadow-sm rounded-lg hover:shadow-md transition-shadow">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-gray-500 uppercase font-medium">Gripper</p>
                      {(() => {
                        const status = getJointStatusDisplay(jointStatus.wrist3, positionDataStale);
                        return status.text === 'Active' ?
                          <CheckCircleIcon className="w-4 h-4 text-green-500" /> :
                          <XCircleIcon className="w-4 h-4 text-red-500" />;
                      })()}
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">J6</h3>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Current angle:</span>
                        <span className="text-gray-900 font-medium text-lg">{jointAngles.wrist3 === null ? 'N/A' : jointAngles.wrist3.toFixed(1)}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Joint status:</span>
                        {(() => {
                          const status = getJointStatusDisplay(jointStatus.wrist3, positionDataStale);
                          return <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>{status.text}</span>;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
