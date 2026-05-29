import { readFile } from 'fs/promises';

async function check() {
    const content = await readFile('firebase-applet-config.json', 'utf8');
    const dbConfig = JSON.parse(content);
    console.log(dbConfig);
}
check();
