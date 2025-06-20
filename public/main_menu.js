document.addEventListener('DOMContentLoaded', () => {
    const startGameButtonMain = document.getElementById('start-game-main');
    const matchmakingStatusElement = document.getElementById('matchmaking-status');
    let socket = null;

    if (!matchmakingStatusElement) {
        console.error('#matchmaking-status element not found. Please add it to main.html.');
        // Optionally create it dynamically if critical, but HTML should define it.
    }

    if (startGameButtonMain) {
        startGameButtonMain.addEventListener('click', () => {
            if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
                console.log('WebSocket is already open or connecting.');
                // Potentially, this button could become a "Cancel Queue" button.
                // For now, we prevent creating a new socket if one is active.
                // if (socket.readyState === WebSocket.OPEN) {
                //     socket.send(JSON.stringify({ type: 'CANCEL_QUEUE' }));
                //     if (matchmakingStatusElement) matchmakingStatusElement.textContent = 'Cancelling queue request...';
                // }
                return;
            }

            if (matchmakingStatusElement) matchmakingStatusElement.textContent = 'Connecting to server...';
            startGameButtonMain.disabled = true;
            startGameButtonMain.textContent = 'Joining Queue...';


            // Ensure the WebSocket URL is correct, especially for deployed environments
            // For local development, 'ws://' + window.location.host is fine.
            // For production, if served via HTTPS, use 'wss://'
            const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
            socket = new WebSocket(wsProtocol + window.location.host);

            socket.onopen = () => {
                console.log('WebSocket connection established.');
                if (matchmakingStatusElement) matchmakingStatusElement.textContent = 'Connection successful! Joining matchmaking queue...';
                socket.send(JSON.stringify({ type: 'JOIN_QUEUE' }));
                startGameButtonMain.textContent = 'Waiting for Match...'; // Update button text
            };

            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log('Message from server:', message);

                    let statusText = `Server: ${message.payload?.text || JSON.stringify(message.payload)}`;

                    switch (message.type) {
                        case 'INFO': // Generic info from server (e.g. welcome, or simple ack)
                            if (message.payload && typeof message.payload === 'string') {
                                statusText = message.payload;
                            } else if (message.payload && message.payload.text) {
                                statusText = message.payload.text;
                            }
                            break;
                        case 'QUEUE_UPDATE': // Example if server sends explicit queue updates
                            statusText = `Players in queue: ${message.payload.playersInQueue}. Your ID: ${message.payload.yourPlayerId}`;
                             // Update button text if still in queue
                            if (startGameButtonMain.textContent !== 'Match Found!') {
                                startGameButtonMain.textContent = `In Queue (${message.payload.playersInQueue})...`;
                            }
                            break;
                        case 'MATCH_FOUND':
                            statusText = `Match Found! Room ID: ${message.payload.roomId}. Opponent: ${message.payload.opponentId}. Starting game...`;
                            startGameButtonMain.textContent = 'Match Found!';
                            startGameButtonMain.disabled = true;

                            console.log(`Match found! Room: ${message.payload.roomId}, Your ID: ${message.payload.yourPlayerId}. Navigating to game...`);
                            if (matchmakingStatusElement) matchmakingStatusElement.textContent = `Match found! Joining room ${message.payload.roomId}...`;

                            // Close the matchmaking socket before navigating
                            if (socket) {
                                socket.onclose = () => {}; // Clear onclose handler to prevent interference
                                socket.close();
                                socket = null; // Nullify the socket
                            }

                            // Navigate to the game page
                            window.location.href = `index.html?room=${message.payload.roomId}&player=${message.payload.yourPlayerId}`;
                            break;
                        case 'ERROR':
                            statusText = `Error from server: ${message.payload}`;
                            startGameButtonMain.disabled = false;
                            startGameButtonMain.textContent = 'Start Game';
                            socket = null; // Clear socket on server error too
                            break;
                        case 'MATCH_FAILED':
                            statusText = `Matchmaking failed: ${message.payload.message}. Please try again.`;
                            startGameButtonMain.disabled = false;
                            startGameButtonMain.textContent = 'Start Game';
                            socket = null; // Clear socket
                            break;
                        default:
                            console.warn(`Unknown message type received: ${message.type}`);
                            break;
                    }
                    if (matchmakingStatusElement) matchmakingStatusElement.textContent = statusText;

                } catch (error) {
                    console.error('Error parsing message from server:', event.data, error);
                    if (matchmakingStatusElement) matchmakingStatusElement.textContent = 'Error processing server message. Check console.';
                    // Potentially re-enable button if parsing error is critical
                    // startGameButtonMain.disabled = false;
                    // startGameButtonMain.textContent = 'Start Game';
                }
            };

            socket.onclose = (event) => {
                console.log('WebSocket connection closed.', event);
                let reason = '';
                if (event.code) { // See https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
                    reason = `Code: ${event.code}, Reason: ${event.reason || 'No reason given'}`;
                }
                if (matchmakingStatusElement) matchmakingStatusElement.textContent = `Disconnected. ${reason} Please try again.`;
                startGameButtonMain.disabled = false;
                startGameButtonMain.textContent = 'Start Game';
                socket = null;
            };

            socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                if (matchmakingStatusElement) matchmakingStatusElement.textContent = 'Connection error. Please ensure server is running and accessible.';
                startGameButtonMain.disabled = false;
                startGameButtonMain.textContent = 'Start Game';
                socket = null;
            };
        });
    } else {
        console.error('#start-game-main button not found.');
    }
});
