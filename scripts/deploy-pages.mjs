// Publication preparation only. Default path makes no network or account calls.
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2);
const accountIndex=args.indexOf('--account');const account=accountIndex>=0?args[accountIndex+1]:null;
const index=args.indexOf('--project');const project=index>=0?args[index+1]:null;
if(!project||!/^[a-z0-9][a-z0-9-]{0,57}[a-z0-9]$/.test(project)){console.error('Usage: node scripts/deploy-pages.mjs --project approved-project [--account approved-account-id --publish-approved]');process.exit(1);}
const assets=fileURLToPath(new URL('../release/pages/',import.meta.url));
const auditPath=fileURLToPath(new URL('../release/publication-audit.json',import.meta.url));
if(!existsSync(auditPath)||!JSON.parse(readFileSync(auditPath,'utf8')).passed){console.error('Run python3 scripts/prepare-publication.py and resolve its audit first.');process.exit(1);}
const audit=JSON.parse(readFileSync(auditPath,'utf8'));
const expected=new Map(audit.files.pages.map(f=>[f.path,f.sha256]));
const actual=readdirSync(assets);
if(actual.length!==expected.size||actual.some(name=>!expected.has(name)||!lstatSync(assets+name).isFile()||createHash('sha256').update(readFileSync(assets+name)).digest('hex')!==expected.get(name))){console.error('Static candidate bytes changed after audit; rebuild before publishing.');process.exit(1);}
const command=['--yes','wrangler@4.145.0','pages','deploy',assets,'--project-name',project,'--branch','main'];
if(!args.includes('--publish-approved')){console.log('DRY RUN — nothing uploaded, installed or authenticated.');console.log('After owner approval and user-controlled login:');console.log('node scripts/deploy-pages.mjs --project '+project+' --account APPROVED_ACCOUNT_ID --publish-approved');process.exit(0);}
if(!account||!/^[0-9a-f]{32}$/i.test(account)){console.error('Publishing requires the exact approved Cloudflare account ID via --account.');process.exit(1);}
// This explicit execution mode is for the approving human. Do not invoke it from an unapproved automation.
console.log('Publishing exactly the approved static folder. Stop if login, project creation or new terms are unexpected.');
const childEnv={CLOUDFLARE_ACCOUNT_ID:account,CI:'1',WRANGLER_SEND_METRICS:'false'};
for(const key of ['PATH','HOME','TMPDIR','TEMP','TMP','SystemRoot','APPDATA','LOCALAPPDATA','USERPROFILE','CLOUDFLARE_API_TOKEN'])if(process.env[key])childEnv[key]=process.env[key];
// Unrelated credentials (wallet/exchange/etc.) are never forwarded.
const result=spawnSync('npx',command,{cwd:assets,stdio:'inherit',env:childEnv});if(result.error){console.error(result.error.message);process.exit(1);}process.exit(result.status??1);
