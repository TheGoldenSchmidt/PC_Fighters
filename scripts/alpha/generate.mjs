// Reproduzierbare Alpha-Daten. Ausführen nur nach bewusster Änderung dieses Autorenkatalogs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = 'packages/engine/src/data';
const read = p => JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write = (p,v) => fs.writeFileSync(path.join(root,p),JSON.stringify(v,null,2)+'\n');
const teams = [
 ['south_park','rostbolzen','South Park','humans',['brainy','hearty'],[
 ['the_coon','The Coon – Eric Cartman'],['mysterion','Mysterion – Kenny McCormick'],['toolshed','Toolshed – Stan Marsh'],['human_kite','Human Kite – Kyle Broflovski'],['mosquito','Mosquito – Clyde Donovan'],['tupperware','Tupperware – Tolkien Black'],['doctor_timothy','Doctor Timothy – Timmy Burch'],['fastpass','Fastpass – Jimmy Valmer'],['super_craig','Super Craig – Craig Tucker'],['wonder_tweek','Wonder Tweek – Tweek Tweak'],['call_girl','Call Girl – Wendy Testaburger'],['captain_diabetes','Captain Diabetes – Scott Malkinson'],['mint_berry_crunch','Mint-Berry Crunch – Bradley Biggle'],['the_new_kid','The New Kid'],['professor_chaos','Professor Chaos – Butters Stotch'],['general_disarray','General Disarray – Dougie O’Connell'],['cthulhu','Cthulhu'],['captain_hindsight','Captain Hindsight'],['manbearpig','ManBearPig'],['nathan','Nathan']]],
 ['rick_morty','super_brainz','Rick and Morty','humans',['brainy','sneaky'],[
 ['mr_nimbus','Mr. Nimbus'],['squanchy','Squanchy'],['vogelmensch_2','Birdperson / Phoenixperson'],['unity','Unity'],['mr_meeseeks','Mr. Meeseeks'],['krombopulos_michael','Krombopulos Michael'],['scary_terry','Scary Terry'],['abradolf_lincler','Abradolf Lincler'],['mr_poopybutthole','Mr. Poopybutthole'],['evil_morty','Evil Morty'],['rick_prime','Rick Prime'],['president_andre_curtis','President Andre Curtis'],['jaguar','Jaguar'],['noob_noob','Noob-Noob'],['snowball','Snowball / Snuffles'],['zeep_xanflorp','Zeep Xanflorp'],['glootie','Glootie'],['fart','Fart'],['cromulon','Cromulon'],['traflorkianer','Traflorkianer']]],
 ['solar_opposites','sonnenfackel','Solar Opposites','animals',['kabloom','solar'],[
 ['korvo_3','Korvo'],['terry_solar_opposites','Terry'],['yumyulack','Yumyulack'],['jesse_solar_opposites','Jesse'],['pupa','The Pupa'],['tim','Tim'],['cherie','Cherie'],['ringo','Ringo / The Duke'],['the_janitor','The Janitor'],['halk_hogam','Halk Hogam'],['nova','Nova / Sister Blista'],['sister_sisto','Sister Sisto'],['pezlie','Pezlie'],['glen_kumstein','Glen Kumstein / Dodge Charger'],['lonesun','LoneSun'],['ventrez','Ventrez'],['pobo','Pobo'],['cromus','Cromus'],['zylenol','Zylenol „Zy“ Peehem'],['skeletom','Skeletom']]],
 ['tier_rudel','kaeptn_kompostible','Tier-Rudel','animals',['kabloom','mega_grow'],[
 ['wolf','Wolf'],['alphawolf','Alphawolf'],['baer','Bär'],['eisbaer','Eisbär'],['adler','Adler'],['luchs','Luchs'],['pferd','Pferd'],['ratte','Ratte'],['schlange','Schlange'],['krokodil','Krokodil'],['schildkroete','Schildkröte'],['hauskater','Hauskater'],['schwarze_katze','Schwarze Katze'],['streuner','Streunerkatze'],['velociraptor','Velociraptor'],['stegosaurus','Stegosaurus'],['triceratops','Triceratops'],['spinosaurus','Spinosaurus'],['brachiosaurus','Brachiosaurus'],['tyrannosaurus_rex','Tyrannosaurus Rex']]]
];
const step = (op,extra={}) => ({op,...extra});
const buff = (atk,hp,scope='selected',temporary=false) => step('buff',{atk,hp,scope,temporary});
const A = (id,name,cost,target,text,steps) => ({id,name,cost,target,text,steps});
const actions = {
 south_park:[
 A('vereinigt','Coon & Friends, vereinigt euch!',3,'none','Alle eigenen Figuren erhalten dauerhaft +1/+1.',[buff(1,1,'own')]),
 A('autoritaet','Respektiert meine Autoritäh!',3,'enemy','Ein Gegner erhält diese Runde -2 Angriff und kann bis zum nächsten Rundenbeginn nicht angreifen.',[buff(-2,0,'selected',true),step('stun')]),
 A('kenny','Oh mein Gott, sie haben Kenny getötet!',3,'grave','Hole eine besiegte eigene Figur mit Kosten bis 3 frisch in eine freie Bahn zurück.',[step('revive',{maxCost:3})]),
 A('kite_schild','Schutzschild des Human Kite',1,'friendly','Verhindere den nächsten Schaden an einer eigenen Figur.',[step('shield')]),
 A('mint','Mint-Berry-Kraft!',4,'none','Heile alle eigenen Figuren um 2 und gib ihnen dauerhaft +1 Angriff.',[step('heal',{scope:'own',amount:2}),buff(1,0,'own')]),
 A('chaos','Professor Chaos’ genialer Plan',2,'none','Alle gegnerischen Figuren verlieren diese Runde 2 Angriff. Deine Basis erleidet als Risiko 1 bis 2 Schaden.',[buff(-2,0,'enemy',true),step('random',{scope:'base',amount:2})]),
 A('poofs','Cheesy Poofs für alle',3,'none','Heile deine Basis um 4. Alle eigenen Figuren erhalten dauerhaft +1 Leben.',[step('heal',{scope:'base',amount:4}),buff(0,1,'own')]),
 A('going_home','Screw You Guys, I’m Going Home',1,'friendly','Nimm eine eigene Figur ohne ihre Verstärkungen zurück auf die Hand. Diese Kopie kostet 1 weniger.',[step('return',{amount:1})])],
 rick_morty:[
 A('portal','Portalpistole',1,'move','Bewege eine eigene Figur in eine freie erlaubte Bahn. Sie wird kampfbereit.',[step('move')]),
 A('hinterhalt','Portal-Hinterhalt',3,'move','Bewege eine eigene Figur in eine freie erlaubte Bahn. Sie führt dort einen Bonusangriff aus.',[step('move'),step('bonus')]),
 A('meeseeks_box','Mr.-Meeseeks-Box',2,'none','Beschwöre einen kampfbereiten 2/2 Meeseeks in der ersten freien erlaubten Bahn. Er stirbt zum nächsten Rundenbeginn.',[step('summon',{cardId:'alpha_mr_meeseeks',temporary:true})]),
 A('wubba','Wubba Lubba Dub-Dub!',3,'damaged','Eine beschädigte eigene Figur erhält dauerhaft +2 Angriff und führt einen Bonusangriff aus.',[buff(2,0),step('bonus')]),
 A('plan','Ricks improvisierter Plan',2,'none','Ziehe 2 Karten. Wähle danach eine Handkarte zum Abwerfen.',[step('draw',{amount:2}),step('discard')]),
 A('saeure','Säurebottich-Trick',1,'friendly','Verstecke eine eigene Figur bis zum nächsten Rundenbeginn. Sie kann weder angreifen noch anvisiert werden; Gegner greifen an ihr vorbei.',[step('hide')]),
 A('kabel','Interdimensionales Kabelfernsehen',2,'none','Erzeuge eine zufällige Karte aus deinem freigegebenen Team auf der Hand.',[step('conjure')]),
 A('schwifty','Get Schwifty!',4,'none','Verschiebe alle eigenen Figuren der vier Landbahnen zyklisch eine Bahn nach rechts und mache sie kampfbereit. Alle erhalten diese Runde +1 Angriff.',[step('moveAll'),buff(1,0,'own',true)])],
 solar_opposites:[
 A('zelle','Schlorpianische Energiezelle',0,'none','Erhalte 2 Energie für diese Runde, höchstens bis zum Energielimit.',[step('energy',{amount:2})]),
 A('reparatur','Korvos Reparaturwahn',2,'friendly','Heile eine eigene Figur um 4 und verhindere ihren nächsten Schaden.',[step('heal',{amount:4}),step('shield')]),
 A('idee','Terry hatte eine Idee',1,'none','Erhalte zufällig 2 Energie für diese Runde oder ziehe 2 Karten.',[step('random',{amount:2})]),
 A('replikanten','Replikanten-Technologie',1,'hand','Eine gewählte Figurenkarte auf deiner Hand kostet 2 weniger, mindestens 0.',[step('discount',{amount:2})]),
 A('evolution','Pupa-Evolution',2,'none','Erhalte 1 Pupa-Fortschritt. Bei 3 Fortschritt: Verbrauche 3 und gib allen eigenen Figuren dauerhaft +2/+2.',[step('evolve')]),
 A('wall','Ausbruch aus der Wall',2,'none','Beschwöre zwei 1/2 Wall-Bewohner in den ersten freien Landbahnen.',[step('summon',{amount:2,cardId:'alpha_wall_bewohner'})]),
 A('silvercop','SilverCop-Verstärkung',3,'none','Beschwöre einen 2/2 SilverCop. Investiere danach bis zu 3 restliche Energie: je +1/+1.',[step('summon',{cardId:'alpha_silvercop',atk:3})]),
 A('neustart','Neustart des Raumschiffs',1,'friendly','Investiere bis zu 4 restliche Energie. Eine eigene Figur erhält je investierter Energie dauerhaft +1/+1.',[step('spendEnergy',{amount:4})])],
 tier_rudel:[
 A('ruf','Ruf des Alphawolfs',3,'none','Alle eigenen Figuren erhalten dauerhaft +1/+1.',[buff(1,1,'own')]),
 A('jagd','Gemeinsam auf der Jagd',4,'friendly','Eine eigene Figur und eigene Figuren in direkt benachbarten Bahnen führen je einen Bonusangriff aus.',[step('bonus',{scope:'adjacent'})]),
 A('futter','Fütterungszeit',2,'friendly','Eine eigene Figur erhält dauerhaft +2/+2.',[buff(2,2)]),
 A('instinkt','Beschützerinstinkt',1,'sacrifice','Wähle einen Beschützer mit Kosten bis 2 und einen anderen Verbündeten. Bis zum nächsten Rundenbeginn übernimmt der Beschützer den nächsten Schaden für ihn.',[step('protect')]),
 A('nachwuchs','Nachwuchs im Rudel',1,'none','Beschwöre einen 1/1 Pteranodon in der ersten freien erlaubten Bahn.',[step('summon',{cardId:'alpha_pteranodon'})]),
 A('vollmond','Heulen bei Vollmond',3,'none','Eigene Wölfe und Katzen erhalten dauerhaft +2/+1.',[buff(2,1,'wolvesCats')]),
 A('stampede','Wilde Stampede',6,'none','Alle eigenen Figuren führen je einen Bonusangriff aus.',[step('bonus',{scope:'own'})]),
 A('staerkste','Überleben des Stärksten',2,'sacrifice','Opfere ein eigenes Tier mit Kosten bis 2. Übertrage seinen aktuellen Angriff und sein übriges Leben dauerhaft auf ein anderes eigenes Tier.',[step('sacrifice')])]
};
const cards=[]; const manifest=[];
const costs=[3,2,2,1,2,3,4,2,3,3,4,2,5,5,4,1,7,3,6,2];
for (const [teamId,champ,name,side,classes,roster] of teams) {
 const creatures=roster.map(([source,label],i)=>{
  const id='alpha_'+source.replace(/_3$|_2$/,''); const cost=costs[i];
  let abilities=[],keywords=[],text='';
  if(teamId==='south_park') { const role=i%5; if(role===0){abilities=[{kind:'aura',scope:'same_top',buff:{atk:1,hp:0},timing:'dauerhaft'}];text='Andere eigene Humans erhalten +1 Angriff.';} if(role===1){abilities=[{kind:'rettung',mode:'revive_1hp'}];text='Überlebt den ersten tödlichen Schaden mit 1 Leben.';} if(role===2){abilities=[{kind:'heilung',scope:'same_top',reichweite:'nachbarn',amount:1}];text='Heilt benachbarte eigene Humans am Rundenende um 1.';} if(role===3){keywords=['team_up'];text='Team-Up: Darf mit einer weiteren eigenen Figur eine Bahn teilen.';} if(role===4){abilities=[{kind:'basisHeilung',timing:'beim_ausspielen',amount:2}];text='Beim Ausspielen: Heile deine Basis um 2.';} }
  if(teamId==='rick_morty') { const role=i%5; if(role===0){keywords=['amphibious'];text='Darf in der Wasserbahn stehen.';} if(role===1){keywords=['flink'];text='Ist sofort kampfbereit.';} if(role===2){keywords=['fliegend'];text='Darf nach dem Kampf in eine freie Bahn fliegen.';} if(role===3){abilities=[{kind:'lernen',n:1}];text='Beim Ausspielen: Ziehe 1 Karte.';} if(role===4){keywords=['flink'];text='Ist sofort kampfbereit.';} }
  if(teamId==='solar_opposites') { const role=i%5; if(role===0){abilities=[{kind:'energie',timing:'rundenstart',amount:1}];text='Erzeugt am Rundenbeginn 1 zusätzliche Energie.';} if(role===1){abilities=[{kind:'basisHeilung',timing:'beim_ausspielen',amount:2}];text='Beim Ausspielen: Heile deine Basis um 2.';} if(role===2){keywords=['armored'];text='Rüstung: Erleidet 1 weniger Kampfschaden.';} if(role===3){keywords=['team_up'];text='Team-Up: Darf mit einer weiteren eigenen Figur eine Bahn teilen.';} if(role===4){abilities=[{kind:'wachstum',per_round:{atk:1,hp:1},maxTriggers:3}];text='Wächst am Rundenbeginn um +1/+1, höchstens dreimal.';} }
  if(teamId==='tier_rudel') { const role=i%5; if(role===0){abilities=[{kind:'skalierung',scope:'same_top',per:{atk:1,hp:0},cap:2,includeSelf:false}];text='Erhält +1 Angriff je weiterem eigenen Animal, höchstens +2.';} if(role===1){abilities=[{kind:'aura',scope:'same_top',buff:{atk:1,hp:0},timing:'dauerhaft'}];text='Andere eigene Animals erhalten +1 Angriff.';} if(role===2){abilities=[{kind:'bedingt',scope:'same_top',mindestAnzahl:2,bonus:{atk:1,hp:1}}];text='Solange mindestens zwei weitere eigene Animals stehen: +1/+1.';} if(role===3){keywords=['team_up'];text='Team-Up: Darf mit einer weiteren eigenen Figur eine Bahn teilen.';} if(role===4){keywords=['fliegend'];text='Darf nach dem Kampf in eine freie Bahn fliegen.';} }
  if(['krokodil','spinosaurus','schildkroete'].includes(source)) keywords=[...new Set([...keywords,'amphibious'])];
  const c={id,name:label,faction:classes[i<10?0:1],teamId,type:'creature',cost,attack:Math.max(1,cost-1),health:cost+1,keywords,abilities,text,tribes:teamId==='tier_rudel'?(/wolf/.test(source)?['wolf']:/kat|luchs|streuner/.test(source)?['cat']:[]):[],deckable:true,referenceName:'Alpha-Primitive v1'};
  if(source==='mr_meeseeks'){c.attack=2;c.health=2;}
  cards.push(c); manifest.push({cardId:id,teamId,role:text,sourceModel:source}); return c;
 });
 const act=actions[teamId].map((a,i)=>{const c={id:`alpha_${teamId}_${a.id}`,name:a.name,faction:classes[i%2],teamId,type:'action',cost:a.cost,effect:{kind:'script',target:a.target,steps:a.steps},text:a.text,tribes:[],deckable:true};cards.push(c);manifest.push({cardId:c.id,teamId,role:c.text,sourceModel:null});return c;});
 // Alle 28 Identitäten plus acht Figuren- und vier Aktionskopien.
 write(`decks/${champ}.json`,{name:`${name} – Alpha`,faction:side,championId:champ,cards:[...creatures.map((c,i)=>({cardId:c.id,count:i<8?2:1})),...act.map((c,i)=>({cardId:c.id,count:i<4?2:1}))]});
}
for(const [id,name,atk,hp,keywords,faction,teamId] of [['alpha_pteranodon','Pteranodon',1,1,['fliegend','amphibious'],'mega_grow','tier_rudel'],['alpha_wall_bewohner','Wall-Bewohner',1,2,[],'solar','solar_opposites'],['alpha_silvercop','SilverCop',2,2,[],'solar','solar_opposites']]) cards.push({id,name,attack:atk,health:hp,keywords,faction,teamId,type:'creature',cost:1,abilities:[],text:'Nur durch Beschwörung erzeugt.',deckable:false,tribes:[]});
write('cards/alpha.json',cards);
write('alpha-catalog.json',{version:1,teams:teams.map(([id,championId,name,side])=>({id,championId,name,side})),cards:manifest});
write('deck-status.json',{active:teams.map(t=>t[1]),allowCustomDecks:false,disabledReason:'Die Alpha verwendet vier feste Starterdecks.'});
const champions=read('champions.json');
for(const team of teams){ const champ=champions.find(c=>c.id===team[1]); champ.name=team[2]; }
write('champions.json',champions);
const powers=read('cards/superpowers.json');
const scripts={
 super_shrink_ray:['enemy',[buff(-3,0),step('draw')],'Ein Gegner erhält dauerhaft -3 Angriff. Ziehe 1 Karte.'],
 super_heroic_health:['none',[step('heal',{scope:'base',amount:6})],'Heile deine Basis um 6.'],
 super_cut_down_to_size:['enemy',[step('destroy',{minAttack:5})],'Zerstöre eine gegnerische Figur mit mindestens 5 Angriff.'],
 super_rock_wall:['friendly',[buff(0,5)],'Eine eigene Figur erhält dauerhaft +5 Leben.'],
 super_carried_away:['move',[step('move'),buff(1,1),step('bonus')],'Bewege eine eigene Figur, gib ihr dauerhaft +1/+1 und führe dort einen Bonusangriff aus.'],
 super_telepathy:['none',[step('draw',{amount:2})],'Ziehe 2 Karten.'],
 super_super_stench:['none',[step('deadly',{scope:'own'}),step('draw')],'Eigene Figuren erhalten diese Runde Tödlich. Ziehe 1 Karte.'],
 super_sunburn:['enemyOrBase',[step('damage',{amount:2}),step('ramp')],'Verursache 2 Schaden an einer gegnerischen Figur oder Basis. Erhalte dauerhaft +1 Energie pro Runde.'],
 super_weed_whack:['enemy',[buff(-2,0)],'Eine gegnerische Figur erhält dauerhaft -2 Angriff.'],
 super_more_spore:['none',[step('summon',{amount:2,cardId:'alpha_wall_bewohner'})],'Beschwöre zwei 1/2 Wall-Bewohner in freien Landbahnen.'],
 super_scorched_earth:['none',[buff(-1,-1,'groundEnemy')],'Gegnerische Figuren auf den drei Bodenbahnen erhalten dauerhaft -1/-1.'],
 super_blazing_bark:['friendly',[buff(4,0)],'Eine eigene Figur erhält dauerhaft +4 Angriff.'],
 super_meteor_strike:['enemy',[step('damage',{amount:3})],'Verursache 3 Schaden an einer gegnerischen Figur.'],
 super_embiggen:['friendly',[buff(2,2)],'Eine eigene Figur erhält dauerhaft +2/+2.'],
 super_time_to_shine:['friendly',[step('bonus')],'Eine eigene Figur führt einen Bonusangriff aus.']};
for(const c of powers) if(scripts[c.id]){ const [target,steps,text]=scripts[c.id];c.effect={kind:'script',target,steps};c.text=text;}
write('cards/superpowers.json',powers);
const identities=read('identity-catalog.json');identities.cards=identities.cards.filter(c=>!c.cardId.startsWith('alpha_'));
for(const c of cards){const side=teams.find(t=>t[0]===c.teamId)[3];identities.cards.push({cardId:c.id,side,classId:c.faction,cardType:c.type,concept:`${c.name}: Identität im Team ${c.teamId}. Spielrolle: ${c.text}`,form:c.type==='creature'?(side==='animals'?'animal':'livingHuman'):'action',rigId:c.type==='creature'?(side==='animals'?'quadruped':'humanoid'):null,variantBrief:c.name+' – vorhandene Figur zuordnen, sonst Platzhalter.',artBrief:`${c.name} – Illustration der Alpha-Karte. Motiv stellt die Spielrolle „${c.text}“ dar.`});}
write('identity-catalog.json',identities);
let models=0;
for(const entry of manifest.filter(e=>e.sourceModel)){
 const candidates=[`tools/figuren-viewer/standalone-figures/${entry.sourceModel}.json`,`${root}/figures/${entry.sourceModel}.json`]; const source=candidates.find(p=>fs.existsSync(p));if(!source)continue;
 const f=JSON.parse(fs.readFileSync(source,'utf8')); if(f.baseId){const base=read('figure-bases/'+f.baseId+'.json');const entryIdentity=identities.cards.find(i=>i.cardId===entry.cardId);if(base&&entryIdentity)entryIdentity.rigId=base.rigId;} delete f.displayName; f.cardId=entry.cardId;write(`figures/${entry.cardId}.json`,f);models++;
}
write('identity-catalog.json',identities);
const report=['# Alpha-Kartenkatalog v1','','Vier feste Decks: je 20 Figuren und acht Aktionen; 40 Karten. Startwerte werden über Playtests abgestimmt.','','| Karte | Team | Kosten | ATK/LP | Wirkung |','|---|---|---:|---|---|',...cards.map(c=>`| ${c.name} | ${c.teamId} | ${c.cost} | ${c.type==='creature'?`${c.attack}/${c.health}`:'–'} | ${c.text} |`)];
fs.writeFileSync('docs/ALPHA-KARTEN.md',report.join('\n')+'\n');
console.log(`${cards.length} Karten inkl. Tokens; ${models} vorhandene Modelle zugeordnet.`);
// Auch die vorhandenen Champ-Kräfte und Wassermerkmale synchron halten.
execFileSync(process.execPath, ['scripts/sync-identity-catalog.mjs', '--write'], { stdio: 'inherit' });
