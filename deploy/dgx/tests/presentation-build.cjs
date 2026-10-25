// Synthetic browser fixture. Run from the repository root in a disposable QA checkout.

const esbuild = require('esbuild');
const path = require('path');
const root = process.cwd();
require('fs').writeFileSync('presentation.html', '<!doctype html><html lang="en"><meta charset="utf-8"><title>DGX presentation qualification fixture</title><div id="root"></div><aside id="source"></aside><script src="presentation-ui.js"></script></html>');
const content = '###Summary\n\n**Evidence** from costs.xlsx, p.3.\n\n| Item | Amount | Approved |\n| --- | --- | --- |\n| Depot | 12 | false |\n| Water | 0 | true |\n| Utility | 2 | false |';
const message = {id:'answer',role:'assistant',createdAt:'now',content,
 citations:[{documentId:'source-a',name:'costs.xlsx',page:3,excerpt:'Original workbook'}],
 sqlArtifact:{generated_sql:'SELECT item, amount, approved FROM costs',tables_used:['costs'],
 columns:['Item','Amount','Approved'],row_count:57,preview_rows:[{Item:'Depot',Amount:12,Approved:false},{Item:'Water',Amount:0,Approved:true},{Item:'Utility',Amount:2,Approved:false}],source_file_id:'source-a',source_file_name:'costs.xlsx'}};
const context = `export function useAuth(){return {session:{source:'live',accessToken:'fixture-token',projectId:'fixture-project'}}}
export function useChat(){return {messages:[{id:'question',role:'user',content:'Summarize project costs'},${JSON.stringify(message)}], openCitation:null,openDocumentPreview(citation){window.lastCitation=citation;document.getElementById('source').textContent='Opened: '+citation.name+', p.'+citation.page}}}`;
esbuild.build({stdin:{contents:`import {createRoot} from 'react-dom/client'; import MessageBubble from './templates/HomePage/MessageBubble';createRoot(document.getElementById('root')).render(<MessageBubble message={${JSON.stringify(message)}}/>);`,resolveDir:root,loader:'tsx'},bundle:true,define:{'process.env.NEXT_PUBLIC_COAIR_API_BASE':'"/coair-api"','process.env.NODE_ENV':'"production"'},jsx:'automatic',outfile:'presentation-ui.js',plugins:[{name:'fixtures',setup(build){
 build.onResolve({filter:/^@\/context\/(Auth|Chat)Context$/},()=>({path:'context',namespace:'fixture'}));
 build.onResolve({filter:/^@\/components\/Image$/},()=>({path:'image',namespace:'fixture'}));
 build.onResolve({filter:/^next\/dynamic$/},()=>({path:'dynamic',namespace:'fixture'}));
 build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='context'?context:args.path==='image'?'export default function Image(){return null}':'export default function dynamic(){return function Chart(){return null}}',loader:'jsx'}));
 build.onResolve({filter:/^@\//},args=>({path:path.join(root,args.path.slice(2))+(args.path.endsWith('types')?'.ts':'.ts')}));
}}]}).catch(error=>{console.error(error);process.exit(1)});
