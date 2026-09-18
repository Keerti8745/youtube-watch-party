import { useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import socket from "./socket";
import "./App.css";

function App() {
    const playerRef = useRef(null);
    const [roomId, setRoomId] = useState("");
    const [username, setUsername] = useState("");
    const [role, setRole] = useState("");
    const [participants, setParticipants] = useState([]);
    const [videoId, setVideoId] = useState("dQw4w9WgXcQ");
    const [videoUrl, setVideoUrl] = useState("");
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState("");
    const [roomState, setRoomState] = useState(null);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const sharedRoomId = urlParams.get("room");

        if (sharedRoomId) {
            setRoomId(sharedRoomId.toUpperCase());
        }

        const handleRoomCreated = (data) => {
            setRoomId(data.roomId);
            setRole(data.role);
        };

        const handleRoomJoined = (data) => {
            setRoomId(data.roomId);
            setUsername(data.username);
            setRole(data.role);
        };

        const handleJoinError = (data) => alert(data.message);
        const handleActionError = (data) => alert(data.message);
        const handlePermissionError = (data) => alert(data.message);
        const handleChatError = (data) => alert(data.message);

        const handleParticipantsUpdated = (data) => {
            setParticipants(data.participants);
        };

        const handleRoleUpdated = (data) => {
            setRole(data.role);
            alert(`Your role is now ${data.role}`);
        };

        const handleHostTransferred = (data) => {
            setRole("HOST");
            alert(data.message);
        };

        const handleRemoved = (data) => {
            alert(data.message);
            resetRoom();
        };

        const handleLeftRoom = () => {
            resetRoom();
        };

        const handleReceiveMessage = (data) => {
            setMessages((previousMessages) => [
                ...previousMessages,
                data
            ]);
        };

        const handleChangeVideo = ({ videoId }) => {
            setVideoId(videoId);
            setRoomState(null);
        };

        const handleRoomState = (data) => {
            setRoomState(data);
            setVideoId(data.currentVideo);
        };

        const handlePlayVideo = ({ currentTime }) => {
            if (!playerRef.current) return;

            playerRef.current.seekTo(currentTime, true);
            playerRef.current.playVideo();
        };

        const handlePauseVideo = ({ currentTime }) => {
            if (!playerRef.current) return;

            playerRef.current.seekTo(currentTime, true);
            playerRef.current.pauseVideo();
        };

        const handleSeekVideo = ({ currentTime }) => {
            if (!playerRef.current) return;

            playerRef.current.seekTo(currentTime, true);
        };

        socket.on("room-created", handleRoomCreated);
        socket.on("room-joined", handleRoomJoined);
        socket.on("join-error", handleJoinError);
        socket.on("action-error", handleActionError);
        socket.on("permission-error", handlePermissionError);
        socket.on("chat-error", handleChatError);
        socket.on("participants-updated", handleParticipantsUpdated);
        socket.on("role-updated", handleRoleUpdated);
        socket.on("host-transferred", handleHostTransferred);
        socket.on("removed-from-room", handleRemoved);
        socket.on("left-room", handleLeftRoom);
        socket.on("receive-message", handleReceiveMessage);
        socket.on("change-video", handleChangeVideo);
        socket.on("room-state", handleRoomState);
        socket.on("play-video", handlePlayVideo);
        socket.on("pause-video", handlePauseVideo);
        socket.on("seek-video", handleSeekVideo);

        return () => {
            socket.off("room-created", handleRoomCreated);
            socket.off("room-joined", handleRoomJoined);
            socket.off("join-error", handleJoinError);
            socket.off("action-error", handleActionError);
            socket.off("permission-error", handlePermissionError);
            socket.off("chat-error", handleChatError);
            socket.off("participants-updated", handleParticipantsUpdated);
            socket.off("role-updated", handleRoleUpdated);
            socket.off("host-transferred", handleHostTransferred);
            socket.off("removed-from-room", handleRemoved);
            socket.off("left-room", handleLeftRoom);
            socket.off("receive-message", handleReceiveMessage);
            socket.off("change-video", handleChangeVideo);
            socket.off("room-state", handleRoomState);
            socket.off("play-video", handlePlayVideo);
            socket.off("pause-video", handlePauseVideo);
            socket.off("seek-video", handleSeekVideo);
        };
    }, []);

    const resetRoom = () => {
        setRoomId("");
        setRole("");
        setParticipants([]);
        setMessages([]);
        setRoomState(null);
        setVideoId("dQw4w9WgXcQ");
        setVideoUrl("");
    };

    const createRoom = () => {
        socket.emit("create-room");
    };

    const joinRoom = () => {
        if (!roomId || !username.trim()) {
            alert("Please enter Room ID and Username");
            return;
        }

        socket.emit("join-room", {
            roomId,
            username: username.trim()
        });
    };

    const leaveRoom = () => {
        if (window.confirm("Are you sure you want to leave the room?")) {
            socket.emit("leave-room");
        }
    };

    const copyInviteLink = async () => {
        if (!roomId) {
            alert("Room ID not available.");
            return;
        }

        const inviteLink = `${window.location.origin}/?room=${roomId}`;

        try {
            await navigator.clipboard.writeText(inviteLink);
            alert("Invite link copied!");
        } catch (error) {
            alert("Unable to copy invite link.");
        }
    };

    const makeModerator = (participantSocketId) => {
        socket.emit("make-moderator", {
            roomId,
            participantSocketId
        });
    };

    const removeParticipant = (participantSocketId) => {
        if (!window.confirm("Are you sure you want to remove this participant?")) {
            return;
        }

        socket.emit("remove-participant", {
            roomId,
            participantSocketId
        });
    };

    const sendMessage = () => {
        if (!message.trim()) return;

        socket.emit("send-message", {
            roomId,
            message: message.trim()
        });

        setMessage("");
    };

    const handleMessageKeyDown = (event) => {
        if (event.key === "Enter") {
            sendMessage();
        }
    };

    const extractVideoId = (url) => {
        try {
            const urlObject = new URL(url.trim());
            const hostname = urlObject.hostname.replace("www.", "");

            if (hostname === "youtu.be") {
                return urlObject.pathname.substring(1).split("/")[0];
            }

            if (hostname === "youtube.com") {
                if (urlObject.pathname === "/watch") {
                    return urlObject.searchParams.get("v");
                }

                if (urlObject.pathname.startsWith("/shorts/")) {
                    return urlObject.pathname.split("/")[2];
                }

                if (urlObject.pathname.startsWith("/embed/")) {
                    return urlObject.pathname.split("/")[2];
                }

                if (urlObject.pathname.startsWith("/live/")) {
                    return urlObject.pathname.split("/")[2];
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    };

    const changeVideo = () => {
        const id = extractVideoId(videoUrl);

        if (!id) {
            alert("Please enter a valid YouTube video URL.");
            return;
        }

        setVideoId(id);
        setRoomState(null);

        socket.emit("change-video", {
            roomId,
            videoId: id
        });
    };

    const onPlayerReady = (event) => {
        playerRef.current = event.target;

        if (roomState) {
            event.target.seekTo(roomState.currentTime || 0, true);

            if (roomState.isPlaying) {
                event.target.playVideo();
            }
        }
    };

    const onPlayerError = (event) => {
        console.log("YouTube Player Error:", event.data);
    };

    const playVideo = () => {
        if (!playerRef.current) {
            alert("Video player is not ready yet.");
            return;
        }

        const currentTime = playerRef.current.getCurrentTime();

        playerRef.current.playVideo();

        socket.emit("play-video", {
            roomId,
            currentTime
        });
    };

    const pauseVideo = () => {
        if (!playerRef.current) {
            alert("Video player is not ready yet.");
            return;
        }

        const currentTime = playerRef.current.getCurrentTime();

        playerRef.current.pauseVideo();

        socket.emit("pause-video", {
            roomId,
            currentTime
        });
    };

    const seekVideo = () => {
        if (!playerRef.current) {
            alert("Video player is not ready yet.");
            return;
        }

        const time = Number(prompt("Enter time in seconds"));

        if (isNaN(time) || time < 0) {
            return;
        }

        playerRef.current.seekTo(time, true);

        socket.emit("seek-video", {
            roomId,
            currentTime: time
        });
    };

    const canControlVideo =
        role === "HOST" || role === "MODERATOR";

    const playerOptions = {
        width: "100%",
        height: "400",
        playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1
        }
    };

    return (
        <div className="app">
            <header className="header">
                <h1>🎬 YouTube Watch Party</h1>
                <p>Watch YouTube videos together in real time</p>
            </header>

            <div className="container">
                <section className="room-card">
                    <h2>🏠 Room</h2>

                    <div className="room-actions">
                        <button
                            className="primary-button"
                            onClick={createRoom}
                        >
                            ➕ Create Room
                        </button>

                        {role === "HOST" && (
                            <div className="room-info">
                                Room ID:
                                <strong>{roomId}</strong>
                            </div>
                        )}
                    </div>

                    {role && (
                        <div className="share-section">
                            <div className="invite-link">
                                <span>🔗 Invite Link:</span>

                                <input
                                    type="text"
                                    value={`${window.location.origin}/?room=${roomId}`}
                                    readOnly
                                />
                            </div>

                            <button
                                className="copy-button"
                                onClick={copyInviteLink}
                            >
                                📋 Copy Invite Link
                            </button>
                        </div>
                    )}

                    <div className="join-section">
                        <input
                            type="text"
                            placeholder="Enter Room ID"
                            value={roomId}
                            onChange={(e) =>
                                setRoomId(e.target.value.toUpperCase())
                            }
                        />

                        <input
                            type="text"
                            placeholder="Enter Username"
                            value={username}
                            onChange={(e) =>
                                setUsername(e.target.value)
                            }
                        />

                        <button
                            className="join-button"
                            onClick={joinRoom}
                        >
                            🚀 Join Room
                        </button>
                    </div>

                    {role && (
                        <div className="role-info">
                            Your Role:
                            <span
                                className={`role-badge ${role.toLowerCase()}`}
                            >
                                {role}
                            </span>
                        </div>
                    )}

                    {role && (
                        <button
                            className="leave-button"
                            onClick={leaveRoom}
                        >
                            🚪 Leave Room
                        </button>
                    )}
                </section>

                {roomId && role && (
                    <>
                        <div className="watch-layout">
                            <section className="video-card">
                                <h2>📺 Watch Room</h2>

                                <div className="youtube-container">
                                    <YouTube
                                        videoId={videoId}
                                        opts={playerOptions}
                                        onReady={onPlayerReady}
                                        onError={onPlayerError}
                                    />
                                </div>

                                {canControlVideo && (
                                    <div className="controls">
                                        <div className="video-change">
                                            <input
                                                type="text"
                                                placeholder="Paste YouTube URL here..."
                                                value={videoUrl}
                                                onChange={(e) =>
                                                    setVideoUrl(e.target.value)
                                                }
                                            />

                                            <button onClick={changeVideo}>
                                                🎬 Change Video
                                            </button>
                                        </div>

                                        <div className="video-controls">
                                            <button onClick={playVideo}>
                                                ▶ Play
                                            </button>

                                            <button onClick={pauseVideo}>
                                                ⏸ Pause
                                            </button>

                                            <button onClick={seekVideo}>
                                                ⏩ Seek
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {!canControlVideo && (
                                    <div className="participant-message">
                                        👀 You are a Participant. You can watch
                                        the video but cannot control it.
                                    </div>
                                )}
                            </section>

                            <section className="participants-card">
                                <h2>👥 Participants</h2>

                                {participants.map((participant) => (
                                    <div
                                        className="participant"
                                        key={participant.socketId}
                                    >
                                        <div className="participant-info">
                                            <strong>
                                                {participant.username}
                                            </strong>

                                            <span
                                                className={`role-badge ${participant.role.toLowerCase()}`}
                                            >
                                                {participant.role}
                                            </span>
                                        </div>

                                        {role === "HOST" &&
                                            participant.username !== "HOST" && (
                                                <div className="participant-actions">
                                                    <button
                                                        onClick={() =>
                                                            makeModerator(
                                                                participant.socketId
                                                            )
                                                        }
                                                    >
                                                        👑 Make Moderator
                                                    </button>

                                                    <button
                                                        onClick={() =>
                                                            removeParticipant(
                                                                participant.socketId
                                                            )
                                                        }
                                                    >
                                                        ❌ Remove
                                                    </button>
                                                </div>
                                            )}
                                    </div>
                                ))}
                            </section>
                        </div>

                        <section className="chat-card">
                            <h2>💬 Room Chat</h2>

                            <div className="chat-messages">
                                {messages.length === 0 && (
                                    <p className="no-messages">
                                        No messages yet. Start the conversation!
                                    </p>
                                )}

                                {messages.map((chatMessage, index) => (
                                    <div
                                        className="chat-message"
                                        key={`${chatMessage.socketId}-${index}`}
                                    >
                                        <strong>
                                            {chatMessage.username}
                                        </strong>

                                        <span className="chat-role">
                                            {chatMessage.role}
                                        </span>

                                        <p>{chatMessage.message}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="chat-input">
                                <input
                                    type="text"
                                    placeholder="Type your message..."
                                    value={message}
                                    onChange={(e) =>
                                        setMessage(e.target.value)
                                    }
                                    onKeyDown={handleMessageKeyDown}
                                />

                                <button onClick={sendMessage}>
                                    📤 Send
                                </button>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}

export default App;