import { Game } from './game/game';

const canvas = document.createElement('canvas');
document.getElementById('app')!.appendChild(canvas);
const game = new Game(canvas);
game.start();

// expose for debugging in devtools
(window as unknown as { __game?: Game }).__game = game;
