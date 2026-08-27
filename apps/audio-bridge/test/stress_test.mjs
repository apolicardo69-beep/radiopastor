// Orquestra pastor (conexão longa) + 3 ciclos de entrada/saída de convidado,
// pra estressar exatamente o bug que a gente encontrou: o contador de
// tentativas de reconexão "vazando" entre trocas de composição sucessivas.
// Depois do 3º ciclo, captura um trecho do stream Icecast pra confirmar via
// análise espectral que as DUAS frequências (pastor + convidado) aparecem
// juntas no áudio final (prova de que o amix funcionou de verdade).
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});

async function openBroadcaster(wavPath, role, token) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://localhost:8090/harness.html');
  // precisa recriar o contexto com o wav certo -> flag é por processo do
  // chromium, não por contexto, então usamos uma page por browser separado
  // pro convidado (ver main() abaixo).
  return { context, page };
}

console.log('t=0 iniciando pastor (fake_pastor.wav, 660Hz)');
const pastorBrowser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--use-file-for-fake-audio-capture=./fake_pastor.wav',
  ],
});
const pastorPage = await pastorBrowser.newPage();
await pastorPage.goto('http://localhost:8090/harness.html');
await pastorPage.evaluate(
  ([role, token]) => window.startBroadcast('ws://localhost:9000', role, token),
  ['pastor', 'dev-token-pastor']
);
console.log('pastor no ar');

async function guestCycle(n, joinWaitMs) {
  console.log(`\n--- ciclo de convidado ${n}: entrando ---`);
  const guestBrowser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--use-file-for-fake-audio-capture=./fake_guest.wav',
    ],
  });
  const guestPage = await guestBrowser.newPage();
  await guestPage.goto('http://localhost:8090/harness.html');
  await guestPage.evaluate(
    ([role, token]) => window.startBroadcast('ws://localhost:9000', role, token),
    ['guest', 'dev-token-guest']
  );
  console.log(`ciclo ${n}: convidado entrou, aguardando ${joinWaitMs}ms antes de sair`);
  await sleep(joinWaitMs);

  if (n === 3) {
    console.log('ciclo 3: capturando stream Icecast por 3s enquanto convidado está no ar...');
    execSync('timeout 3 curl -s http://localhost:8000/radio -o /tmp/stress_mix.mp3');
    console.log('captura feita');
  }

  await guestPage.evaluate(() => window.stopBroadcast());
  await sleep(300);
  await guestBrowser.close();
  console.log(`--- ciclo ${n}: convidado saiu ---`);
}

await sleep(2000);
await guestCycle(1, 4000);
await sleep(2000);
await guestCycle(2, 4000);
await sleep(2000);
await guestCycle(3, 5000);

await sleep(1000);
await pastorPage.evaluate(() => window.stopBroadcast());
await sleep(500);
await pastorBrowser.close();
console.log('\npastor fora do ar. teste concluído.');
process.exit(0);
