const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

const gameBoard = document.getElementById('game-board');
const scoreElement = document.getElementById('score');
const levelDisplayElement = document.getElementById('level-display'); // Added
const kosDisplayElement = document.getElementById('kos-display');     // Added

const nextPieceElement = document.getElementById('next-piece');
const startButton = document.getElementById('start-button');
const pauseButton = document.getElementById('pause-button');
const resetButton = document.getElementById('reset-button');
const gameOverMessageElement = document.createElement('div');
gameOverMessageElement.id = 'game-over-message';
gameOverMessageElement.style.display = 'none';
gameOverMessageElement.textContent = 'GAME OVER!';


let board = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
let currentPiece = null;
let score = 0;
let nextPiece = null;
let isPaused = false;
let gameOver = false;
let gameInterval = null;

// Game state variables for stats and progression
let currentLevel = 1;
let totalLinesCleared = 0;
let kos = 0;
const LINES_PER_LEVEL = 5;
const INITIAL_GAME_SPEED = 1000;
const SPEED_INCREMENT_PER_LEVEL = 50;

// Multiplayer context variables
let roomId = null;
let playerId = null;
let gameSocket = null;

// --- Tetrominoes ---
const TETROMINOES = {
  'I': {
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    color: 'cyan',
    id: 1
  },
  'J': {
    shape: [
      [2, 0, 0],
      [2, 2, 2],
      [0, 0, 0]
    ],
    color: 'blue',
    id: 2
  },
  'L': {
    shape: [
      [0, 0, 3],
      [3, 3, 3],
      [0, 0, 0]
    ],
    color: 'orange',
    id: 3
  },
  'O': {
    shape: [
      [4, 4],
      [4, 4]
    ],
    color: 'yellow',
    id: 4
  },
  'S': {
    shape: [
      [0, 5, 5],
      [5, 5, 0],
      [0, 0, 0]
    ],
    color: 'lime',
    id: 5
  },
  'T': {
    shape: [
      [0, 6, 0],
      [6, 6, 6],
      [0, 0, 0]
    ],
    color: 'purple',
    id: 6
  },
  'Z': {
    shape: [
      [7, 7, 0],
      [0, 7, 7],
      [0, 0, 0]
    ],
    color: 'red',
    id: 7
  }
};

const PIECES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

function getRandomPiece() {
  const type = PIECES[Math.floor(Math.random() * PIECES.length)];
  const piece = TETROMINOES[type];
  // Return a new object to avoid modifying the original TETROMINOES
  return {
    shape: piece.shape.map(row => row.slice()), // Deep copy shape
    color: piece.color,
    id: piece.id,
    x: Math.floor(COLS / 2) - Math.ceil(piece.shape[0].length / 2), // Center horizontally
    y: 0 // Start at the top
  };
}

// --- Game Logic Functions (will be implemented in later steps) ---

function drawBoard() {
  gameBoard.innerHTML = ''; // Clear previous state
  board.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell !== 0) {
        const block = document.createElement('div');
        block.classList.add('block');
        // Use the color from TETROMINOES definition
        block.style.backgroundColor = Object.values(TETROMINOES).find(t => t.id === cell)?.color || 'gray';
        block.style.gridColumnStart = colIndex + 1;
        block.style.gridRowStart = rowIndex + 1;
        gameBoard.appendChild(block);
      }
    });
  });
}

function drawPieceOnBoard(piece) {
  piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        const boardX = piece.x + x;
        const boardY = piece.y + y;
        if (boardX >= 0 && boardX < COLS && boardY >= 0 && boardY < ROWS) {
          const block = document.createElement('div');
          block.classList.add('block');
          block.style.backgroundColor = piece.color;
          block.style.gridColumnStart = boardX + 1;
          block.style.gridRowStart = boardY + 1;
          // Add a temporary class for current piece blocks if needed for styling
          block.classList.add('current-piece-block');
          gameBoard.appendChild(block);
        }
      }
    });
  });
}

function drawNextPieceDisplay() {
  nextPieceElement.innerHTML = ''; // Clear previous state
  if (nextPiece) {
    // Center the piece in the nextPieceElement
    const piece = nextPiece;
    const shape = piece.shape;
    const elementGridSize = 4; // As defined in CSS for #next-piece
    const shapeWidth = shape[0].length;
    const shapeHeight = shape.reduce((max, row) => Math.max(max, row.filter(cell => cell !== 0).length > 0 ? 1 : 0) + (row.some(cell => cell !== 0) ? 1 : 0), 0);


    const colOffset = Math.floor((elementGridSize - shapeWidth) / 2);
    const rowOffset = Math.floor((elementGridSize - shape.length) / 2);

    shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          const block = document.createElement('div');
          block.classList.add('block');
          block.style.backgroundColor = piece.color;
          // Adjust position to center in the small grid
          block.style.gridColumnStart = x + 1 + colOffset;
          block.style.gridRowStart = y + 1 + rowOffset;
          nextPieceElement.appendChild(block);
        }
      });
    });
  }
}


function updateUIDisplays() {
  scoreElement.textContent = `Score: ${score}`;
  levelDisplayElement.textContent = `Level: ${currentLevel}`;
  kosDisplayElement.textContent = `KOs: ${kos}`;
  // if (attackerInfoElement) attackerInfoElement.textContent = 'Attacked by: None'; // Example
}

function resetGameLogic() { // Renamed to avoid conflict if resetGame is also an event handler name
  board = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
  score = 0;
  currentLevel = 1;
  totalLinesCleared = 0;
  kos = 0;
  // updateScore(); // Replaced by updateUIDisplays
  updateUIDisplays();

  currentPiece = null;
  nextPiece = getRandomPiece();
  // spawnNewPiece(); // This will be called by startGame or after piece locks typically
  isPaused = true; // Start in a paused state often
  gameOver = false;
  gameOverMessageElement.style.display = 'none';

  if (gameInterval) {
    clearInterval(gameInterval);
    gameInterval = null;
  }
  drawBoard();
  drawNextPieceDisplay(); // Show the initial next piece
}


function resetGame() {
  console.log("Reset button clicked. Resetting game logic...");
  resetGameLogic();
  // currentPiece should be null here from resetGameLogic
  // nextPiece is set. If we want to show the very first piece immediately:
  // spawnNewPiece(); // This would move nextPiece to currentPiece
  // drawCurrentState(); // And draw it.
  // However, typically start button would handle the first spawn.
  // For now, ensure board is clear and stats are reset.
  console.log("Game reset, ready for Start.");
}


function spawnNewPiece() {
  currentPiece = nextPiece;
  nextPiece = getRandomPiece();
  if (currentPiece) {
      currentPiece.x = Math.floor(COLS / 2) - Math.ceil(currentPiece.shape[0].length / 2);
      currentPiece.y = 0;
  }
  // TODO: Check for game over if new piece collides immediately
  if (checkCollision(currentPiece)) {
    console.log("Game Over - New piece collision on spawn");
    setGameOver();
    return false; // Indicate spawn failed
  }
  drawNextPieceDisplay();
  return true; // Indicate spawn succeeded
}

function movePieceDown() {
  if (!currentPiece || isPaused) return;

  currentPiece.y++;
  if (checkCollision(currentPiece)) {
    currentPiece.y--; // Revert move
    lockPiece();
    clearLines(); // Check and clear lines after locking a piece
    if (!spawnNewPiece()) {
        // spawnNewPiece already calls setGameOver if it fails
        return; // Stop movePieceDown as game is over
    }
  }
  // It's important to draw the entire board and then the current piece
  // to avoid leaving trails of the old piece position.
  drawCurrentState();
}

function lockPiece() {
  if (!currentPiece) return;
  currentPiece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        const boardX = currentPiece.x + x;
        const boardY = currentPiece.y + y;
        // Ensure piece is within board boundaries before locking
        if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
          board[boardY][boardX] = currentPiece.id;
        }
      }
    });
  });
  // After locking, the currentPiece is null until a new one spawns
}

function clearLines() {
  let linesClearedThisTurn = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(cell => cell !== 0)) {
      linesClearedThisTurn++;
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(0));
      r++;
    }
  }

  if (linesClearedThisTurn > 0) {
    score += calculateScore(linesClearedThisTurn);
    totalLinesCleared += linesClearedThisTurn;
    // updateScore(); // Replaced by updateUIDisplays call below

    let newLevel = Math.floor(totalLinesCleared / LINES_PER_LEVEL) + 1;
    if (newLevel > currentLevel) {
      currentLevel = newLevel;
      console.log(`Level up to: ${currentLevel}`);
      if (!isPaused && !gameOver) { // Only adjust speed if game is active
        let newSpeed = Math.max(100, INITIAL_GAME_SPEED - (SPEED_INCREMENT_PER_LEVEL * (currentLevel - 1)));
        if (gameInterval) clearInterval(gameInterval); // Clear existing interval
        gameInterval = setInterval(gameLoop, newSpeed);
        console.log(`New game speed: ${newSpeed}`);
      }
    }
    updateUIDisplays(); // Update score, level, etc. on screen
    console.log(`Cleared ${linesClearedThisTurn} lines. Total lines: ${totalLinesCleared}. Score: ${score}. Level: ${currentLevel}`);
  }
}

function calculateScore(linesClearedThisTurn) {
    const lineScores = [0, 10, 30, 50, 100]; // Score for 0, 1, 2, 3, 4 lines
    if (linesClearedThisTurn >= lineScores.length) return lineScores[lineScores.length-1] * 2;
    return lineScores[linesClearedThisTurn];
}


function checkCollision(piece) {
  if (!piece || !piece.shape) return false; // Ensure piece and piece.shape are valid
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (piece.shape[y][x] !== 0) {
        const boardX = piece.x + x;
        const boardY = piece.y + y;

        // Check boundaries
        if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
          return true; // Collision with wall or floor
        }
        // Check against locked pieces on the board (only if boardY is non-negative)
        if (boardY >= 0 && board[boardY][boardX] !== 0) {
          return true; // Collision with another piece
        }
      }
    }
  }
  return false;
}

function gameLoop() {
  if (!isPaused) {
    movePieceDown();
  }
}

// --- Player Controls ---

function movePieceLeft() {
  if (!currentPiece || isPaused || gameOver) return;
  currentPiece.x--;
  if (checkCollision(currentPiece)) {
    currentPiece.x++; // Revert if collision
  }
  drawCurrentState();
}

function movePieceRight() {
  if (!currentPiece || isPaused || gameOver) return;
  currentPiece.x++;
  if (checkCollision(currentPiece)) {
    currentPiece.x--; // Revert if collision
  }
  drawCurrentState();
}

function rotatePiece() {
  if (!currentPiece || isPaused || gameOver) return;
  const originalShape = currentPiece.shape.map(row => row.slice()); // Deep copy
  const N = currentPiece.shape.length;
  const newShape = Array(N).fill(null).map(() => Array(N).fill(0));

  // Transpose and reverse rows to rotate clockwise
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      newShape[x][N - 1 - y] = currentPiece.shape[y][x];
    }
  }
  currentPiece.shape = newShape;

  // Handle collision after rotation (e.g., wall kicks or revert)
  if (checkCollision(currentPiece)) {
    // Basic collision handling: revert rotation
    // TODO: Implement wall kicks for more advanced rotation system
    currentPiece.shape = originalShape;
  }
  drawCurrentState();
}


document.addEventListener('keydown', event => {
  // Allow pause/unpause even if game over, but block other controls
  if (gameOver && event.key !== 'p' && event.key !== 'P' && event.key !== 'Escape') {
      // 'Escape' could be tied to reset button in future
      return;
  }
  if (isPaused && event.key !== 'p' && event.key !== 'P') return;


  switch (event.key) {
    case 'ArrowLeft':
    case 'a': // Common alternative
      movePieceLeft();
      break;
    case 'ArrowRight':
    case 'd': // Common alternative
      movePieceRight();
      break;
    case 'ArrowUp':
    case 'w': // Common alternative for rotation
      rotatePiece();
      break;
    case 'ArrowDown':
    case 's': // Soft drop
      // movePieceDown() is already called by gameLoop, calling it here makes it one step faster.
      // For a more pronounced soft drop, you might temporarily reduce gameInterval.
      // However, a direct call is a simple and effective soft drop.
      movePieceDown();
      break;
    case ' ': // Space bar for Hard Drop
      hardDrop();
      break;
    case 'p': // Pause
    case 'P':
        pauseGame();
        break;
  }
});

function drawCurrentState() {
  drawBoard(); // Draws the locked pieces
  if (currentPiece) {
    drawPieceOnBoard(currentPiece); // Draws the current falling piece
  }
}


function startGame() {
  if (gameInterval) {
    clearInterval(gameInterval);
  }
  // Hide game over message at start
  gameOverMessageElement.style.display = 'none'; // Hide game over message
  // gameBoard.appendChild(gameOverMessageElement); // Already added during initial setup

  gameOver = false;
  isPaused = false;
  board = Array(ROWS).fill(null).map(() => Array(COLS).fill(0)); // Clear board

  // Reset game state variables
  score = 0;
  currentLevel = 1;
  totalLinesCleared = 0;
  kos = 0;
  updateUIDisplays(); // Update all UI elements

  nextPiece = getRandomPiece(); // Get the first "next" piece
  if (!spawnNewPiece()) { // Spawn the first piece (currentPiece = nextPiece, new nextPiece)
      // Game over on start if piece can't spawn, spawnNewPiece handles setGameOver
      return;
  }

  drawCurrentState(); // Draw the board and the first piece

  if (gameInterval) clearInterval(gameInterval); // Clear any existing interval
  if (!gameOver) { // Only start interval if game is not over
    gameInterval = setInterval(gameLoop, INITIAL_GAME_SPEED); // Use initial game speed
    console.log("Game started with speed:", INITIAL_GAME_SPEED);
  } else {
    console.log("Game over flag is true, not starting game loop.");
  }
}

function hardDrop() {
  if (!currentPiece || isPaused || gameOver) return;
  let canMove = true;
  while(canMove) {
    currentPiece.y++;
    if (checkCollision(currentPiece)) {
      currentPiece.y--;
      canMove = false;
    }
  }
  // Once dropped, lock piece, clear lines, and spawn new piece
  lockPiece();
  clearLines();
  if (!spawnNewPiece()) {
    // Game over handled by spawnNewPiece
    return;
  }
  drawCurrentState(); // Update display immediately
}

function setGameOver() {
    gameOver = true;
    isPaused = true; // Also set isPaused to stop game loop processing
    if (gameInterval) {
        clearInterval(gameInterval);
        gameInterval = null;
    }
    gameOverMessageElement.style.display = 'block';
    console.log("GAME OVER set");
}


// function resetGame() has been updated to resetGameLogic and a new resetGame for event handling
// Ensure the event listener calls the correct one if names changed.
// The `resetGame` function above the `spawnNewPiece` is now the event handler.
// The actual logic is in `resetGameLogic`. This is fine.


function pauseGame() {
  if (gameOver) return; // Don't allow pause/unpause if game is over

  isPaused = !isPaused;
  if (isPaused) {
    // Keep gameInterval reference, just clear it
    if (gameInterval) clearInterval(gameInterval);
    console.log("Game paused");
  } else {
    // Resume game
    if (gameInterval) { // If interval was cleared by pause, but still exists
        gameInterval = setInterval(gameLoop, 1000); // Re-establish with same ID
    } else if (currentPiece) { // If interval was nulled (e.g. by reset then start then pause)
        gameInterval = setInterval(gameLoop, 1000);
    } else {
         // Game was likely reset and not started, or some other edge case
        console.log("Cannot resume. Game not active or in a state to be resumed without start.");
        isPaused = true; // Remain paused
        return; // Do not proceed to log "Game resumed"
    }
    console.log("Game resumed");
  }
}

// --- Event Listeners ---
startButton.addEventListener('click', startGame);
pauseButton.addEventListener('click', pauseGame);
resetButton.addEventListener('click', resetGame);


// --- Initial Setup ---
// Add game over message element to the game board container for better positioning
const gameBoardContainer = document.getElementById('game-board-container');
if (gameBoardContainer) {
    gameBoardContainer.appendChild(gameOverMessageElement);
} else {
    // Fallback if the specific container isn't found (shouldn't happen with new HTML)
    document.body.appendChild(gameOverMessageElement);
}
// Style the game over message (already defined in style.css, but can be overridden or ensured here)
// gameOverMessageElement.style.position = 'absolute'; // These are now primarily handled by CSS
// gameOverMessageElement.style.color = 'red';
// gameOverMessageElement.style.fontSize = '2em';
// gameOverMessageElement.style.fontWeight = 'bold';
// gameOverMessageElement.style.top = '50%';
// gameOverMessageElement.style.left = '50%';
// gameOverMessageElement.style.transform = 'translate(-50%, -50%)';
// gameOverMessageElement.style.zIndex = '1000'; // Already handled by CSS

// --- Game Initialization for Multiplayer ---
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room');
    playerId = urlParams.get('player');

    console.log(`Game page loaded. Room ID: ${roomId}, Player ID: ${playerId}`);

    if (!roomId || !playerId) {
        console.error('Room ID or Player ID missing from URL.');
        const gameUiContainer = document.getElementById('tetris-99-layout');
        if (gameUiContainer) {
            gameUiContainer.innerHTML = '<p style="color: red; text-align: center; font-size: 20px; padding-top: 50px;">Error: Necessary game information (Room or Player ID) is missing. Please return to the main menu and try again.</p>';
        }
        // Disable game controls if they exist and are enabled by default
        if(startButton) startButton.disabled = true;
        if(pauseButton) pauseButton.disabled = true;
        if(resetButton) resetButton.disabled = true;
        return; // Stop further game initialization
    }

    // Initialize UI to default state before connection attempt
    resetGameLogic(); // Resets board, score, level variables and updates UI
    // Crucially, resetGameLogic() should NOT start any game intervals itself.

    initializeGameWebSocket();
});

function initializeGameWebSocket() {
    const wsGameProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    gameSocket = new WebSocket(wsGameProtocol + window.location.host);

    gameSocket.onopen = () => {
        console.log('Game WebSocket connection established.');
        gameSocket.send(JSON.stringify({
            type: 'JOIN_ROOM',
            payload: { roomId: roomId, playerId: playerId }
        }));
        // Update UI: e.g., status bar "Connected to room..."
        // For now, console log is primary feedback.
    };

    gameSocket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('Message from game server:', message);

            switch (message.type) {
                case 'ROOM_JOIN_CONFIRMATION':
                    console.log(`Successfully joined room: ${message.payload.roomId}. Players now in room: ${message.payload.playersInRoom.join(', ')}. Your ID: ${message.payload.yourPlayerId}`);
                    // Update UI (e.g., display player list, room ID)
                    // Can also confirm if message.payload.yourPlayerId matches our playerId
                    if(playerId !== message.payload.yourPlayerId) {
                        console.warn("Player ID mismatch from server confirmation!");
                    }
                    // Display a waiting message or enable a "Ready" button
                    const gameBoardContainer = document.getElementById('game-board-container');
                    if (gameBoardContainer && !document.getElementById('waiting-message')) {
                        const waitingMsg = document.createElement('p');
                        waitingMsg.id = 'waiting-message';
                        waitingMsg.textContent = 'Successfully joined room. Waiting for game to start...';
                        waitingMsg.style.color = 'white';
                        waitingMsg.style.textAlign = 'center';
                        waitingMsg.style.position = 'absolute'; // Overlay style
                        waitingMsg.style.top = '40%';
                        waitingMsg.style.left = '50%';
                        waitingMsg.style.transform = 'translate(-50%, -50%)';
                        waitingMsg.style.fontSize = '20px';
                        gameBoardContainer.appendChild(waitingMsg); // Append to container
                    }
                    // Ensure controls are disabled while waiting
                    if(pauseButton) pauseButton.disabled = true;
                    if(resetButton) resetButton.disabled = true;
                    if(startButton) startButton.disabled = true; // Game page start button
                    break;

                case 'GAME_START':
                    console.log('Server initiated GAME_START. Starting countdown...', message.payload);
                    const waitingMsgElement = document.getElementById('waiting-message');
                    if (waitingMsgElement) waitingMsgElement.remove();

                    initiateGameCountdown();
                    break;
                case 'GAME_STATE_UPDATE': // Placeholder for future state sync
                    console.log('Received game state update:', message.payload);
                    // This is where you'd handle opponent board rendering, etc.
                    break;
                case 'PLAYER_LEFT_ROOM': // Placeholder
                     console.log(`Player ${message.payload.playerId} left the room.`);
                     // Update UI, perhaps show a message
                    break;
                case 'ERROR':
                    console.error(`Error from server: ${message.payload.message || message.payload}`);
                    // Display error on UI
                    const errDisplay = document.getElementById('game-board-container') || document.body;
                    const errMsgP = document.createElement('p');
                    errMsgP.textContent = `Server Error: ${message.payload.message || message.payload}`;
                    errMsgP.style.color = "red";
                    errDisplay.appendChild(errMsgP);
                    break;
                default:
                    console.warn(`Unknown message type from server: ${message.type}`);
            }
        } catch (error) {
            console.error('Error parsing message from game server:', event.data, error);
        }
    };

    gameSocket.onclose = () => {
        console.log('Game WebSocket connection closed.');
        if (!gameOver) {
            // setGameOver(); // Or a specific "disconnected" game over state
            console.warn("Game WebSocket closed before local game over.");
            // Display a message indicating disconnection.
        }
        const gameUiContainer = document.getElementById('tetris-99-layout') || document.body;
        const existingDisconnectMsg = document.getElementById('disconnect-message');
        if (!existingDisconnectMsg) { // Prevent multiple messages
            const disconnectMsg = document.createElement('p');
            disconnectMsg.id = 'disconnect-message';
            disconnectMsg.textContent = 'Disconnected from game server. The game may no longer be active.';
            disconnectMsg.style.color = 'orange';
            disconnectMsg.style.textAlign = 'center';
            disconnectMsg.style.padding = '20px';
            gameUiContainer.appendChild(disconnectMsg);
        }
        // Disable game interactions
        if(startButton) startButton.disabled = true;
        if(pauseButton) pauseButton.disabled = true;
        // resetButton might still be useful to reset the local view, or navigate home.
    };

    gameSocket.onerror = (error) => {
        console.error('Game WebSocket error:', error);
        const gameUiContainer = document.getElementById('tetris-99-layout') || document.body;
        const existingErrorMsg = document.getElementById('ws-error-message');
        if (!existingErrorMsg) {
            const errorMsg = document.createElement('p');
            errorMsg.id = 'ws-error-message';
            errorMsg.textContent = 'Error connecting to game server. Please try again later.';
            errorMsg.style.color = 'red';
            gameUiContainer.appendChild(errorMsg);
        }
         if(startButton) startButton.disabled = true;
         if(pauseButton) pauseButton.disabled = true;
    };
}

function initiateGameCountdown() {
    const gameBoardContainer = document.getElementById('game-board-container');
    if (!gameBoardContainer) {
        console.error('Game board container not found for countdown. Starting game immediately.');
        resetGameLogic();
        startGame();
        if(pauseButton) pauseButton.disabled = false;
        if(resetButton) resetButton.disabled = false;
        return;
    }

    // Clear other messages like "Waiting..." if they are not structured to be overlaid
    // For instance, if waiting message was directly in gameBoardContainer:
    // gameBoardContainer.innerHTML = ''; // Be cautious if game-board is inside this and shouldn't be cleared

    const countdownElement = document.createElement('div');
    countdownElement.id = 'countdown-display'; // Assign an ID for potential styling via CSS
    countdownElement.style.position = 'absolute';
    countdownElement.style.top = '50%';
    countdownElement.style.left = '50%';
    countdownElement.style.transform = 'translate(-50%, -50%)';
    countdownElement.style.fontSize = '72px'; // Larger countdown text
    countdownElement.style.color = '#FFF';
    countdownElement.style.fontWeight = 'bold';
    countdownElement.style.zIndex = '20'; // Ensure it's above game board but below other UI if needed
    gameBoardContainer.appendChild(countdownElement);

    let count = 5;
    countdownElement.textContent = count;

    const intervalId = setInterval(() => {
        count--;
        if (count > 0) {
            countdownElement.textContent = count;
        } else if (count === 0) {
            countdownElement.textContent = 'GO!';
        } else {
            clearInterval(intervalId);
            if (countdownElement.parentNode) { // Check if still part of DOM
                countdownElement.parentNode.removeChild(countdownElement);
            }

            // Ensure game board is clear for Tetris blocks (if it was affected)
            // gameBoard.innerHTML = ''; // This clears the grid cells if blocks are direct children.
                                     // Current drawBoard clears it anyway.

            resetGameLogic(); // Prepare board, score, level
            startGame();    // Initialize pieces and start game loop

            // Enable controls AFTER game starts
            if(pauseButton) pauseButton.disabled = false;
            if(resetButton) resetButton.disabled = false;
            // startButton on game page should remain disabled in MP context
            if(startButton) startButton.disabled = true;
        }
    }, 1000);
}


// The initial call to resetGameLogic() at the end of the script is removed.
// It's now called within the DOMContentLoaded listener before WebSocket initialization.
// This ensures the game state and UI are reset without auto-starting the game loop.
console.log("Game script loaded. Waiting for DOMContentLoaded to initialize multiplayer.");
