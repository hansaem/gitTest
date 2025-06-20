document.addEventListener('DOMContentLoaded', () => {
    const startGameButtonMain = document.getElementById('start-game-main');

    if (startGameButtonMain) {
        startGameButtonMain.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    } else {
        console.error("'start-game-main' button not found. Ensure your main.html is correct.");
    }
});
