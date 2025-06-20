const express = require('express');
const http = require('http');
const path = require('path'); // For path manipulation

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// Serve main.html at the root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

// Serve other static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
});

const WebSocket = require('ws');
const wss = new WebSocket.Server({ server }); // 'server' is the http.createServer instance

// Placeholder for connected clients and matchmaking queue
const clients = new Map(); // ws -> { id: clientId, ws: ws }
let matchmakingQueue = []; // Array of { id: clientId, ws: ws, joinedAt: Date.now() }
const activeRooms = new Map(); // To store active game rooms: roomId -> roomObject

// Matchmaking settings
const MATCH_MAX_PLAYERS = 2;
const MATCH_MAX_WAIT_SECONDS = 10;
let matchmakingTimer = null;

function broadcastQueueStatus() {
    const statusPayload = {
        playersInQueue: matchmakingQueue.length,
        // Potentially add estimated wait time or other info
    };
    // Inform each client in the queue about their position or total,
    // and other clients just about the total.
    // For simplicity now, just broadcast total.
    clients.forEach(clientData => {
        if (clientData.ws.readyState === WebSocket.OPEN) {
            // Check if this client is in queue to provide more specific info if needed
            const inQueue = matchmakingQueue.some(p => p.id === clientData.id);
            clientData.ws.send(JSON.stringify({
                type: 'QUEUE_UPDATE',
                payload: {
                    playersInQueue: matchmakingQueue.length,
                    yourPlayerId: clientData.id, // Good to send this for client context
                    isInQueue: inQueue
                }
            }));
        }
    });
    console.log(`Broadcasted queue status: ${matchmakingQueue.length} players.`);
}


function tryMatchmake() {
    if (matchmakingQueue.length === 0) {
        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
            console.log("Matchmaking queue empty, timer cleared.");
        }
        return;
    }

    const firstPlayerInQueue = matchmakingQueue[0];
    const timeWaited = (Date.now() - firstPlayerInQueue.joinedAt) / 1000;
    const canMakeInstantMatch = matchmakingQueue.length >= MATCH_MAX_PLAYERS;
    const waitedLongEnough = timeWaited >= MATCH_MAX_WAIT_SECONDS;

    console.log(`TryMatchmake: Queue size: ${matchmakingQueue.length}, First player waited: ${timeWaited.toFixed(1)}s. Timer: ${matchmakingTimer ? 'active' : 'inactive'}`);


    if (canMakeInstantMatch || waitedLongEnough) {
        const playersToMatchCount = Math.min(matchmakingQueue.length, MATCH_MAX_PLAYERS);
        // For a 1v1 game, we need at least 2. If it's battle royale, then this logic changes slightly.
        // Assuming we want to match MATCH_MAX_PLAYERS if possible.
        // If waitedLongEnough, even a smaller group than MATCH_MAX_PLAYERS might be matched if MATCH_MAX_PLAYERS > 2
        // For now, strict MATCH_MAX_PLAYERS or timeout for the first player with any available players (min 2).

        if (matchmakingQueue.length < 2 && waitedLongEnough && MATCH_MAX_PLAYERS >=2 ) { // Not enough players even after waiting
             console.log(`Player ${firstPlayerInQueue.id} timed out, but not enough players to form a match (need at least 2). Resetting their timer by re-adding.`);
             // To prevent spamming this log, only re-add if timer logic is sophisticated.
             // For now, just let them wait more until another joins or timer restarts.
             if (matchmakingTimer) clearTimeout(matchmakingTimer); // Clear existing timer
             matchmakingTimer = setTimeout(() => { tryMatchmake(); }, (MATCH_MAX_WAIT_SECONDS * 1000 +100)); // Restart timer
             return;
        }


        // Take the exact number of players for a match, or all if fewer than MAX but waited long enough (and >=2)
        const actualPlayersToMatch = (waitedLongEnough && matchmakingQueue.length >= 2) ?
                                     Math.min(matchmakingQueue.length, MATCH_MAX_PLAYERS) :
                                     (canMakeInstantMatch ? MATCH_MAX_PLAYERS : 0);

        if (actualPlayersToMatch < 2 && MATCH_MAX_PLAYERS >=2) { // Ensure we have at least 2 players for a match
            if (!matchmakingTimer) { // Only start a new timer if one isn't already running
                matchmakingTimer = setTimeout(() => { tryMatchmake(); }, (MATCH_MAX_WAIT_SECONDS * 1000 +100));
            }
            return;
        }


        const playersToMatch = matchmakingQueue.splice(0, actualPlayersToMatch);

        if (playersToMatch.length >= 2 || (MATCH_MAX_PLAYERS === 1 && playersToMatch.length === 1)) {
            const roomId = 'room-' + generateUniqueId();
            console.log(`Forming match for room ${roomId} with players: ${playersToMatch.map(p => p.id).join(', ')}`);

            const newRoom = {
                id: roomId,
                players: playersToMatch.map(p => ({ id: p.id, ws: p.ws, status: 'connected' })),
                createdAt: Date.now(),
                gameStarted: false,
                gameState: {} // Placeholder for actual game state
            };
            activeRooms.set(roomId, newRoom);
            console.log(`Room ${roomId} created and stored. Active rooms: ${activeRooms.size}`);

            playersToMatch.forEach(player => {
                if (player.ws.readyState === WebSocket.OPEN) {
                    player.ws.send(JSON.stringify({
                        type: 'MATCH_FOUND',
                        payload: {
                            roomId: roomId,
                            players: newRoom.players.map(pInfo => pInfo.id), // Send IDs of all players in the room
                            yourPlayerId: player.id,
                            opponentId: newRoom.players.length === 2 ? newRoom.players.find(pInfo => pInfo.id !== player.id)?.id : null
                        }
                    }));
                }
            });
            broadcastQueueStatus(); // Queue size has changed
        } else if (playersToMatch.length > 0) { // Not enough for a match, put them back
             matchmakingQueue.unshift(...playersToMatch); // Add them back to the front
             console.log("Players put back in queue as not enough for a full match yet.");
        }


        if (matchmakingTimer) {
            clearTimeout(matchmakingTimer);
            matchmakingTimer = null;
        }
        // If queue still has players, recursively call or set new timer
        if (matchmakingQueue.length > 0) {
            tryMatchmake(); // This will evaluate and set a new timer if needed
        }

    } else if (!matchmakingTimer && matchmakingQueue.length > 0) {
        const timeToWait = (MATCH_MAX_WAIT_SECONDS - timeWaited) * 1000 + 100; // Add buffer
        console.log(`Queue has players, but not enough or not waited long enough. Starting matchmaking timer for ${timeToWait / 1000}s`);
        matchmakingTimer = setTimeout(() => {
            matchmakingTimer = null;
            tryMatchmake();
        }, timeToWait);
    }
}


wss.on('connection', (ws) => {
    const clientId = generateUniqueId();
    clients.set(ws, { id: clientId, ws: ws, roomId: null }); // Initialize roomId as null
    console.log(`Client ${clientId} connected. Total clients: ${clients.size}.`);
    ws.send(JSON.stringify({ type: 'INFO', payload: {text: `Welcome! Your ID is ${clientId}. You are connected.`} }));


    ws.on('message', (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
        } catch (error) {
            console.error(`Failed to parse message from ${clientId}: ${message}`, error);
            ws.send(JSON.stringify({ type: 'ERROR', payload: 'Invalid JSON message format' }));
            return;
        }

        console.log(`Received message from ${clientId}:`, parsedMessage);

        switch (parsedMessage.type) {
            case 'JOIN_QUEUE':
                const clientData = clients.get(ws);
                if (!clientData) {
                    console.error(`Client data not found for ${clientId}. Cannot join queue.`);
                    ws.send(JSON.stringify({ type: 'ERROR', payload: 'Client session error, please reconnect.' }));
                    return;
                }

                const alreadyInQueue = matchmakingQueue.some(player => player.id === clientData.id);
                if (alreadyInQueue) {
                    console.log(`Client ${clientData.id} already in queue.`);
                    ws.send(JSON.stringify({ type: 'ERROR', payload: 'You are already in the queue.' }));
                    return;
                }

                matchmakingQueue.push({ id: clientData.id, ws: ws, joinedAt: Date.now() });
                console.log(`Client ${clientData.id} added to matchmaking queue. Queue size: ${matchmakingQueue.length}`);
                ws.send(JSON.stringify({ type: 'INFO', payload: { text: 'You have joined the matchmaking queue.' } }));

                broadcastQueueStatus();
                tryMatchmake();
                break;

            case 'JOIN_ROOM':
                const { roomId, playerId: playerIdFromPayload } = parsedMessage.payload;

                const room = activeRooms.get(roomId);
                if (!room) {
                    console.warn(`Client (ID from payload: ${playerIdFromPayload}) tried to join non-existent room ${roomId}`);
                    ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Room not found.' } }));
                    return;
                }

                const playerRecordInRoom = room.players.find(p => p.id === playerIdFromPayload);
                if (!playerRecordInRoom) {
                    console.warn(`Player ${playerIdFromPayload} not found in room ${roomId}'s roster.`);
                    ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Player not found in this room.' } }));
                    return;
                }

                // Handle if player is already connected, possibly with an old/stale socket.
                if (playerRecordInRoom.status === 'ingame_connected' && playerRecordInRoom.ws !== ws) {
                    console.log(`Player ${playerIdFromPayload} reconnected or connected from a new client for room ${roomId}. Old socket will be orphaned if not closed by client.`);
                    // Optionally, you could try to close `playerRecordInRoom.ws` if it's different and still open,
                    // but managing two WebSockets for the same player ID simultaneously can be complex.
                    // The current approach of overwriting `ws` assumes the new connection is the valid one.
                }

                playerRecordInRoom.ws = ws; // Assign the new (game page) WebSocket to this player in the room
                playerRecordInRoom.status = 'ingame_connected';

                // Update the global clients map with this new ws connection and its context
                // This is crucial for server-wide knowledge of this active game socket.
                // The 'clientId' used here is the one associated with this specific ws connection from wss.on('connection')
                // We need to ensure this 'clientId' (from clients.get(ws).id before this point) is correctly associated
                // OR, more simply, use playerIdFromPayload as the authoritative ID.
                const clientDataForThisWS = clients.get(ws);
                if (clientDataForThisWS && clientDataForThisWS.id !== playerIdFromPayload) {
                     console.warn(`Initial clientId ${clientDataForThisWS.id} for this WebSocket connection does not match playerId ${playerIdFromPayload} from JOIN_ROOM payload. Updating to payload ID.`);
                     clientDataForThisWS.id = playerIdFromPayload; // Align the ID
                }
                // Now set/update the client in the global map, ensuring roomId is associated.
                clients.set(ws, { id: playerIdFromPayload, ws: ws, roomId: roomId });

                console.log(`Player ${playerIdFromPayload} successfully updated and connected to room ${roomId}. Player status: ${playerRecordInRoom.status}`);

                ws.send(JSON.stringify({
                    type: 'ROOM_JOIN_CONFIRMATION',
                    payload: {
                        roomId: room.id,
                        yourPlayerId: playerIdFromPayload,
                        playersInRoom: room.players.map(p => p.id),
                        message: `Successfully joined room ${room.id}. Waiting for other players...`
                    }
                }));

                // Check if all players have joined to start the game
                const allPlayersJoined = room.players.every(p => p.status === 'ingame_connected');
                if (allPlayersJoined && !room.gameStarted) {
                    room.gameStarted = true;
                    console.log(`All players connected in room ${roomId}. Starting game.`);
                    room.players.forEach(p => {
                        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({
                                type: 'GAME_START',
                                payload: {
                                    roomId: room.id,
                                    message: 'All players connected. Game starting!'
                                    // Can include initial game settings or player turn info here
                                }
                            }));
                        }
                    });
                }
                break;

            case 'PING':
                ws.send(JSON.stringify({ type: 'PONG' }));
                break;

            case 'BOARD_UPDATE':
                const clientDataForBoardUpdate = clients.get(ws);
                if (!clientDataForBoardUpdate || !clientDataForBoardUpdate.roomId) {
                    console.error('BOARD_UPDATE received from client not in a room or unknown client.');
                    // ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'You are not in a room to send board updates.' }}));
                    return;
                }

                const { board: receivedBoardData } = parsedMessage.payload;
                if (!receivedBoardData) {
                    console.error('BOARD_UPDATE received without board data from client:', clientDataForBoardUpdate.id);
                    ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Board data missing in BOARD_UPDATE.' }}));
                    return;
                }

                const currentRoom = activeRooms.get(clientDataForBoardUpdate.roomId);
                if (!currentRoom) {
                    console.error(`Room not found (${clientDataForBoardUpdate.roomId}) for BOARD_UPDATE from client: ${clientDataForBoardUpdate.id}`);
                    // This might happen if room was cleaned up but client sent one last update.
                    return;
                }

                // Optional: Store the latest board state in the player's record within the room
                const playerRecord = currentRoom.players.find(p => p.id === clientDataForBoardUpdate.id);
                if (playerRecord) {
                    playerRecord.currentBoard = receivedBoardData; // Store for potential future use (e.g. new joiners seeing current state)
                }

                // Broadcast this board update to all *other* players in the room
                currentRoom.players.forEach(playerInRoom => {
                    if (playerInRoom.id !== clientDataForBoardUpdate.id && playerInRoom.ws && playerInRoom.ws.readyState === WebSocket.OPEN) {
                        try {
                            // console.log(`Sending OPPONENT_BOARD_UPDATE from ${clientDataForBoardUpdate.id} to ${playerInRoom.id}`);
                            playerInRoom.ws.send(JSON.stringify({
                                type: 'OPPONENT_BOARD_UPDATE',
                                payload: {
                                    opponentId: clientDataForBoardUpdate.id, // The ID of the player whose board this is
                                    board: receivedBoardData
                                }
                            }));
                        } catch (sendError) {
                            console.error(`Error sending OPPONENT_BOARD_UPDATE to player ${playerInRoom.id}:`, sendError);
                        }
                    }
                });
                break;

            default:
                console.log(`Unknown message type from ${clientId}: ${parsedMessage.type}`);
                ws.send(JSON.stringify({ type: 'ERROR', payload: `Unknown message type: ${parsedMessage.type}` }));
        }
    });

    ws.on('close', () => {
        const clientData = clients.get(ws);
        const disconnectedClientId = clientData?.id || 'unknown';
        const clientRoomId = clientData?.roomId;

        console.log(`Client ${disconnectedClientId} disconnected. Was in room: ${clientRoomId || 'none'}`);

        // Removal from matchmaking queue (if they were there)
        const indexInQueue = matchmakingQueue.findIndex(player => player.id === disconnectedClientId);
        if (indexInQueue > -1) {
            matchmakingQueue.splice(indexInQueue, 1);
            console.log(`Client ${disconnectedClientId} removed from matchmaking queue due to disconnect.`);
            broadcastQueueStatus();
        }

        // Handle room-related disconnection
        if (clientRoomId) {
            const room = activeRooms.get(clientRoomId);
            if (room) {
                const playerInRoom = room.players.find(p => p.id === disconnectedClientId);
                if (playerInRoom) {
                    playerInRoom.status = 'disconnected';
                    console.log(`Player ${disconnectedClientId} marked as disconnected in room ${clientRoomId}.`);
                    // Notify other players in the room (future enhancement)
                    // room.players.forEach(p => {
                    //     if (p.id !== disconnectedClientId && p.ws && p.ws.readyState === WebSocket.OPEN) {
                    //         p.ws.send(JSON.stringify({ type: 'PLAYER_LEFT_ROOM', payload: { playerId: disconnectedClientId }}));
                    //     }
                    // });
                }
                // Optional: Check if room is now empty or game should end
                const activePlayersInRoom = room.players.filter(p => p.status === 'ingame_connected');
                if (activePlayersInRoom.length === 0 && room.gameStarted) { // Or < 2 for competitive games
                    console.log(`Room ${clientRoomId} is now empty or has no active players. Removing room.`);
                    activeRooms.delete(clientRoomId);
                } else if (activePlayersInRoom.length === 1 && room.gameStarted && room.players.length > 1) {
                    // If one player remains in a 2+ player game, they might be the winner
                    console.log(`Player ${activePlayersInRoom[0].id} is the last one active in room ${clientRoomId}.`);
                    // Send WINNER_BY_DEFAULT or similar message (future)
                }
            }
        }

        clients.delete(ws);
        console.log(`Total clients after disconnect: ${clients.size}. Queue size: ${matchmakingQueue.length}. Active rooms: ${activeRooms.size}`);

        // If the disconnected client was the only one in queue, or affected matchmaking conditions
        if (!clientRoomId) { // Only call tryMatchmake if they were not in a room (i.e. potentially in queue)
            tryMatchmake();
        }
    });

    ws.on('error', (error) => {
        const clientData = clients.get(ws);
        const errorClientId = clientData?.id || 'unknown';
        console.error(`WebSocket error for client ${errorClientId}:`, error);
        // Consider closing the WebSocket connection if it's still open and an error occurs
        // if (ws.readyState === WebSocket.OPEN) {
        //     ws.close();
        // }
        // clients.delete(ws); // Ensure cleanup if error leads to unusable connection
    });

    ws.send(JSON.stringify({ type: 'INFO', payload: `Welcome, Client ${clientId}!`}));
});

// Helper function to generate simple unique IDs (for demonstration)
function generateUniqueId() {
    return Math.random().toString(36).substr(2, 9);
}

console.log('WebSocket server initialized and attached to HTTP server.');
