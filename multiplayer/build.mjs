import {mkdir, copyFile} from 'node:fs/promises';
await mkdir('public/multiplayer', {recursive: true});
for (const file of ['index.html', 'multiplayer/client.mjs', 'multiplayer/rules.mjs']) {
  await copyFile(file, 'public/' + file);
}
