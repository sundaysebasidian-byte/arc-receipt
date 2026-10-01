// Public read-only RPC, no wallet and no secret inputs. Run explicitly with npm run probe.
import { writeFile } from 'node:fs/promises';
import { ARC, TRANSFER, createRPC, verifyTransaction } from '../web/verifier.mjs';
const rpc = createRPC();
const startedAt = new Date().toISOString();
const probe = { startedAt, rpcURL: ARC.rpc, writes: 0 };
try {
  probe.chainId = await rpc('eth_chainId');
  probe.head = await rpc('eth_blockNumber');
  probe.erc20Decimals = await rpc('eth_call', [{ to: ARC.usdc, data: '0x313ce567' }, 'latest']);
  if (BigInt(probe.chainId) !== 5042n || BigInt(probe.erc20Decimals) !== 6n) throw new Error('Mainnet configuration does not match documentation.');
  const head = BigInt(probe.head);
  const logs = await rpc('eth_getLogs', [{ address: ARC.emitter, fromBlock: '0x' + (head > 32n ? head - 32n : 0n).toString(16), toBlock: probe.head, topics: [TRANSFER] }]);
  probe.sampledBlocks = 33; probe.logCount = logs.length;
  const candidate = logs.find(log => log.topics?.length === 3 && BigInt(log.topics[1]) !== 0n && BigInt(log.topics[2]) !== 0n && log.topics[1] !== log.topics[2] && BigInt(log.data) > 0n && log.removed !== true);
  if (candidate) {
    let recipient = '0x' + candidate.topics[2].slice(-40);
    let certificate = await verifyTransaction({ txHash: candidate.transactionHash, recipient, minConfirmations: 1 }, rpc);
    const balances = new Map();
    for (const movement of certificate.movements.filter(m => m.kind === 'transfer')) {
      const units = BigInt(movement.units);
      balances.set(movement.to, (balances.get(movement.to) || 0n) + units);
      balances.set(movement.from, (balances.get(movement.from) || 0n) - units);
    }
    const positive = [...balances].find(([,units]) => units > 0n);
    if (positive) {
      recipient = positive[0];
      certificate = await verifyTransaction({ txHash: candidate.transactionHash, recipient, minConfirmations: 1 }, rpc);
    }
    // Curated UI fixtures remain stable; discovery only writes its own observation.
    await writeFile(new URL('../evidence/mainnet-probe-candidate.json', import.meta.url), JSON.stringify(certificate,null,2)+'\n');
    probe.sampleTransaction = candidate.transactionHash; probe.sampleRecipient = recipient; probe.sampleStatus = certificate.status; probe.netReceivedUSDC = certificate.netReceivedUSDC;
  } else probe.sampleBlocker = 'No qualifying public transfer in 33 recent blocks. No transaction was created.';
  probe.outcome = 'mainnet_read_success';
} catch (error) { probe.outcome = 'blocked'; probe.error = error.message; process.exitCode = 1; }
probe.completedAt = new Date().toISOString();
await writeFile(new URL('../evidence/mainnet-probe.json', import.meta.url),JSON.stringify(probe,null,2)+'\n');
console.log(JSON.stringify(probe,null,2));
