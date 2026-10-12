import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const project=resolve(fileURLToPath(new URL('.',import.meta.url)),'../..');
const source=await readFile(resolve(project,'contracts/FreshProof.py'),'utf8');
await writeFile(resolve(project,'site/public/contract-source.py'),source.replaceAll('\r\n','\n'));
