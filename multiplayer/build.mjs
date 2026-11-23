import {mkdir, copyFile, cp, readFile, writeFile} from 'node:fs/promises';
await mkdir('public/multiplayer', {recursive: true});
for (const file of ['index.html','finals.html','multiplayer/how-to-play.js','multiplayer/finals-ui.mjs','multiplayer/finals-rules.mjs', 'multiplayer/client.mjs', 'multiplayer/rules.mjs', 'multiplayer/catalog.mjs', 'multiplayer/exile-puzzles.mjs', 'multiplayer/plates.mjs', 'multiplayer/rooms-client.mjs']) {
  await copyFile(file, 'public/' + file);
}
await cp('art', 'public/art', {recursive: true});
// Use the same rule implementations on both platforms. Only Wrangler bundles this module.
const html = await readFile('index.html', 'utf8');
const source = html.match(/<script>([\s\S]+?)<\/script>/)?.[1];
if (!source) throw new Error('The game script is missing');
await writeFile('multiplayer/generated-game.mjs', `import * as exilePuzzles from './exile-puzzles.mjs';
export function runGame(document, onlineGame, id, question = 1) {
  const window = {onlineGame, exilePuzzles, dispatchEvent() {}};
  const Option = class { constructor(textContent) { this.textContent = String(textContent); } };
  const clearInterval = () => {};
  ${source}
  mode = games.findIndex(game => game[0] === id);
  round = question - 1;
  next();
}
`);
