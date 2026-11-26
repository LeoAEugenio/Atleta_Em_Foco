  const API_BASE_URL=window.location.port==='5500'?'http://localhost:5042':'';
  // Para adaptar a identidade a outro clube, altere este objeto.
  const clubBranding={name:'Aimoré',fullName:'Clube Esportivo Aimoré',primary:'#174782',secondary:'#ffffff',logo:'assets/aimore-escudo.png'};
  document.documentElement.style.setProperty('--club-primary',clubBranding.primary);
  document.documentElement.style.setProperty('--club-secondary',clubBranding.secondary);
  document.querySelectorAll('[data-club-name]').forEach(el=>el.textContent=clubBranding.name);
  document.querySelectorAll('[data-club-full-name]').forEach(el=>el.textContent=clubBranding.fullName);
  document.querySelectorAll('[data-club-logo]').forEach(el=>{el.src=clubBranding.logo;el.alt='Brasão do '+clubBranding.fullName});
  let sessionToken=sessionStorage.getItem('atletaEmFocoToken')||'';
  let currentUser=null;
  async function apiFetch(path,options={}){
    const headers=new Headers(options.headers||{});
    if(sessionToken)headers.set('Authorization','Bearer '+sessionToken);
    const response=await fetch(API_BASE_URL+path,{...options,headers});
    if(response.status===401&&sessionToken){signOut('Sua sessão expirou. Entre novamente.');}
    return response;
  }
  function authMessage(id,text,isError=false){const el=document.getElementById(id);el.textContent=text||'';el.classList.toggle('error',isError)}
  function signOut(message=''){sessionToken='';currentUser=null;sessionStorage.removeItem('atletaEmFocoToken');sessionStorage.removeItem('atletaEmFocoUser');document.getElementById('appShell').classList.add('hidden');document.getElementById('authGate').classList.remove('hidden');document.getElementById('loginPanel').classList.remove('hidden');document.getElementById('setupPanel').classList.add('hidden');authMessage('authMessage',message,!!message)}
  function openApp(user){
    currentUser=user;role=user.role.toLowerCase();
    document.getElementById('authGate').classList.add('hidden');document.getElementById('appShell').classList.remove('hidden');
    document.getElementById('roleLabel').textContent=role==='commission'?'Comissão técnica':(role==='admin'?'Administrador':'Atleta');
    document.getElementById('userLabel').textContent=user.username;document.getElementById('avatar').textContent=role==='commission'?'CT':(role==='admin'?'AD':'AT');
    document.getElementById('athleteName').textContent=user.athleteName||'atleta';
    document.querySelectorAll('.nav button').forEach(button=>{button.classList.toggle('hidden',role==='athlete'?!['pre','post'].includes(button.dataset.page):!['dashboard','reports','athletes'].includes(button.dataset.page))});
    document.querySelectorAll('[data-go="pre"],[data-go="post"]').forEach(button=>button.classList.toggle('hidden',role!=='athlete'));
    if(role==='athlete'){go('pre')}else{go('dashboard');loadRecords()}
  }
  async function initializeAuth(){
    try{
      const statusResponse=await fetch(API_BASE_URL+'/api/auth/status');
      if(!statusResponse.ok)throw new Error('A API não respondeu. Inicie a API e atualize a página.');
      const status=await statusResponse.json();
      if(!status.initialized&&status.setupAvailable)document.getElementById('showSetup').classList.remove('hidden');
      if(sessionToken){
        const me=await apiFetch('/api/auth/me');
        if(me.ok){const user=await me.json();openApp(user);return}
        sessionStorage.removeItem('atletaEmFocoToken');sessionToken='';
      }
    }catch(error){authMessage('authMessage',error.message||'Não foi possível conectar à API.',true)}
  }
  document.getElementById('loginForm').addEventListener('submit',async event=>{
    event.preventDefault();authMessage('authMessage','Verificando acesso…');
    const form=event.currentTarget;
    try{
      const response=await fetch(API_BASE_URL+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:form.username.value,password:form.password.value})});
      const result=response.status===401?null:await response.json();
      if(!response.ok)throw new Error(result?.message||'Usuário ou senha incorretos.');
      sessionToken=result.token;sessionStorage.setItem('atletaEmFocoToken',sessionToken);
      openApp(result.user);authMessage('authMessage','');form.reset();
    }catch(error){authMessage('authMessage',error.message||'Falha ao entrar.',true)}
  });
  document.getElementById('setupForm').addEventListener('submit',async event=>{
    event.preventDefault();authMessage('setupMessage','Criando os acessos…');
    const form=event.currentTarget;
    try{
      const payload={athleteUsername:form.athleteUsername.value,athletePassword:form.athletePassword.value,commissionUsername:form.commissionUsername.value,commissionPassword:form.commissionPassword.value};
      const response=await fetch(API_BASE_URL+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json();if(!response.ok)throw new Error(result.message||'Não foi possível criar os acessos.');
      form.reset();document.getElementById('setupPanel').classList.add('hidden');document.getElementById('loginPanel').classList.remove('hidden');
      authMessage('authMessage',result.message);
    }catch(error){authMessage('setupMessage',error.message||'Falha ao configurar os acessos.',true)}
  });
  document.getElementById('showSetup').addEventListener('click',()=>{document.getElementById('loginPanel').classList.add('hidden');document.getElementById('setupPanel').classList.remove('hidden');authMessage('setupMessage','')});
  document.getElementById('backToLogin').addEventListener('click',()=>{document.getElementById('setupPanel').classList.add('hidden');document.getElementById('loginPanel').classList.remove('hidden')});
  document.getElementById('logoutButton').addEventListener('click',()=>signOut());

  const names={dashboard:'Visão geral',pre:'Pré-treino',post:'Pós-treino',reports:'Relatórios',athletes:'Atletas e acessos'};
  let currentPage='dashboard', role='commission', bodyView='front';
  let records=[];
  let athleteSessions=[];
  const regionNames={head:'Cabeça',neck:'Pescoço',shoulderL:'Ombro esquerdo',shoulderR:'Ombro direito',armL:'Braço esquerdo',armR:'Braço direito',elbowL:'Cotovelo esquerdo',elbowR:'Cotovelo direito',wristL:'Punho esquerdo',wristR:'Punho direito',handL:'Mão esquerda',handR:'Mão direita',chest:'Peitoral',back:'Costas',abdomen:'Abdômen',hipL:'Quadril esquerdo',hipR:'Quadril direito',thighL:'Coxa esquerda',thighR:'Coxa direita',kneeL:'Joelho esquerdo',kneeR:'Joelho direito',calfL:'Panturrilha esquerda',calfR:'Panturrilha direita',ankleL:'Tornozelo esquerdo',ankleR:'Tornozelo direito',footL:'Pé esquerdo',footR:'Pé direito'};
  // Regiões selecionáveis na perspectiva do atleta, com frente e costas.
  const shapes={front:[
    ['head','ellipse',80,23,16,20],['neck','rect',73,43,14,12],['shoulderL','ellipse',53,67,15,12],['shoulderR','ellipse',107,67,15,12],
    ['chest','ellipse',80,78,24,18],['abdomen','ellipse',80,111,18,21],['armL','path','M52 72 Q39 77 36 103 L29 133 Q29 139 34 140 Q39 139 41 133 L52 106 L62 83Z'],['armR','path','M108 72 Q121 77 124 103 L131 133 Q131 139 126 140 Q121 139 119 133 L108 106 L98 83Z'],
    ['elbowL','circle',36,107,7],['elbowR','circle',124,107,7],['wristL','circle',31,137,6],['wristR','circle',129,137,6],
    ['handL','path','M32 143 Q27 141 25 148 L22 159 Q21 164 26 166 Q30 166 32 161 L35 153 L37 163 Q40 166 43 163 L46 150 Q47 144 42 141Z'],['handR','path','M128 143 Q133 141 135 148 L138 159 Q139 164 134 166 Q130 166 128 161 L125 153 L123 163 Q120 166 117 163 L114 150 Q113 144 118 141Z'],
    ['hipL','ellipse',67,136,13,12],['hipR','ellipse',93,136,13,12],
    ['thighL','path','M66 143 Q54 149 55 174 L59 208 Q61 218 68 216 Q74 214 74 204 L78 163 Q78 149 66 143Z'],['thighR','path','M94 143 Q106 149 105 174 L101 208 Q99 218 92 216 Q86 214 86 204 L82 163 Q82 149 94 143Z'],
    ['kneeL','ellipse',66,218,11,10],['kneeR','ellipse',94,218,11,10],['calfL','path','M62 228 Q56 233 59 253 L64 278 Q66 284 71 280 L76 250 L75 231Z'],['calfR','path','M98 228 Q104 233 101 253 L96 278 Q94 284 89 280 L84 250 L85 231Z'],
    ['ankleL','ellipse',68,284,7,6],['ankleR','ellipse',92,284,7,6],['footL','path','M62 280 Q67 284 75 280 L78 291 Q80 295 77 299 Q72 303 57 302 Q52 301 55 296 L60 288Z'],['footR','path','M98 280 Q93 284 85 280 L82 291 Q80 295 83 299 Q88 303 103 302 Q108 301 105 296 L100 288Z']
  ],back:[
    ['head','ellipse',80,23,16,20],['neck','rect',73,43,14,12],['shoulderL','ellipse',53,67,15,12],['shoulderR','ellipse',107,67,15,12],['back','ellipse',80,86,23,30],
    ['armL','path','M52 72 Q39 77 36 103 L29 133 Q29 139 34 140 Q39 139 41 133 L52 106 L62 83Z'],['armR','path','M108 72 Q121 77 124 103 L131 133 Q131 139 126 140 Q121 139 119 133 L108 106 L98 83Z'],['elbowL','circle',36,107,7],['elbowR','circle',124,107,7],['wristL','circle',31,137,6],['wristR','circle',129,137,6],
    ['handL','path','M32 143 Q27 141 25 148 L22 159 Q21 164 26 166 Q30 166 32 161 L35 153 L37 163 Q40 166 43 163 L46 150 Q47 144 42 141Z'],['handR','path','M128 143 Q133 141 135 148 L138 159 Q139 164 134 166 Q130 166 128 161 L125 153 L123 163 Q120 166 117 163 L114 150 Q113 144 118 141Z'],
    ['hipL','ellipse',67,136,13,12],['hipR','ellipse',93,136,13,12],['thighL','path','M66 143 Q54 149 55 174 L59 208 Q61 218 68 216 Q74 214 74 204 L78 163 Q78 149 66 143Z'],['thighR','path','M94 143 Q106 149 105 174 L101 208 Q99 218 92 216 Q86 214 86 204 L82 163 Q82 149 94 143Z'],['kneeL','ellipse',66,218,11,10],['kneeR','ellipse',94,218,11,10],['calfL','path','M62 228 Q56 233 59 253 L64 278 Q66 284 71 280 L76 250 L75 231Z'],['calfR','path','M98 228 Q104 233 101 253 L96 278 Q94 284 89 280 L84 250 L85 231Z'],['ankleL','ellipse',68,284,7,6],['ankleR','ellipse',92,284,7,6],['footL','path','M62 280 Q67 284 75 280 L78 291 Q80 295 77 299 Q72 303 57 302 Q52 301 55 296 L60 288Z'],['footR','path','M98 280 Q93 284 85 280 L82 291 Q80 295 83 299 Q88 303 103 302 Q108 301 105 296 L100 288Z']
  ]};
  const heatIds=['shoulderL','shoulderR','back','hipL','hipR','thighL','thighR','kneeL','kneeR','calfL','calfR','handL','handR','footL','footR'];
  const NS='http://www.w3.org/2000/svg';
  function makeShape(item, mini=false){let [id,type,...v]=item;let el=document.createElementNS(NS,type);el.setAttribute('class',mini?'body-base region':'region');el.dataset.region=id;el.setAttribute('aria-label',regionNames[id]);if(type==='ellipse'){['cx','cy','rx','ry'].forEach((a,i)=>el.setAttribute(a,v[i]))}else if(type==='circle'){['cx','cy','r'].forEach((a,i)=>el.setAttribute(a,v[i]))}else if(type==='rect'){['x','y','width','height','rx'].forEach((a,i)=>el.setAttribute(a,v[i]??2))}else el.setAttribute('d',v[0]);if(!mini){el.setAttribute('tabindex','0');el.setAttribute('role','button');el.setAttribute('aria-pressed','false')}return el}
  function createFigure(view,mini=false){const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox',mini?'0 0 160 330':'0 0 160 430');svg.setAttribute('width','160');svg.setAttribute('height',mini?'330':'430');svg.setAttribute('role',mini?'img':'group');svg.setAttribute('aria-label',view==='front'?'Mapa anatômico visto de frente':'Mapa anatômico clicável, músculos vistos por trás');const body=document.createElementNS(NS,'g');if(!mini)body.setAttribute('transform','translate(-32 0) scale(1.4 1.3)');const base=document.createElementNS(NS,'g');base.innerHTML='<circle class="body-base" cx="80" cy="23" r="16"/><rect class="body-base" x="73" y="42" width="14" height="16" rx="6"/><path class="limb" d="M65 53 Q80 47 95 53 L109 63 Q116 67 112 83 L106 133 Q105 143 99 147 L104 211 Q107 219 103 228 L100 276 Q99 286 92 286 L88 281 L90 235 Q89 229 86 224 L82 171 L78 224 Q75 230 74 235 L76 281 L71 286 Q64 286 63 276 L60 228 Q56 219 59 211 L61 147 Q55 143 54 133 L48 83 Q44 67 51 63Z"/><path class="limb" d="M52 67 Q40 70 36 94 L28 133 Q27 140 33 141 Q39 140 41 134 L56 96Z M108 67 Q120 70 124 94 L132 133 Q133 140 127 141 Q121 140 119 134 L104 96Z"/><path class="limb" d="M34 140 Q29 139 27 145 L23 158 Q22 164 27 165 Q31 165 34 159 L37 151 L39 161 Q42 165 45 161 L47 148 Q48 142 42 139Z M126 140 Q131 139 133 145 L137 158 Q138 164 133 165 Q129 165 126 159 L123 151 L121 161 Q118 165 115 161 L113 148 Q112 142 118 139Z M62 279 Q68 284 75 280 L78 291 Q80 295 77 299 Q72 303 57 302 Q52 301 55 296 L60 288Z M98 279 Q92 284 85 280 L82 291 Q80 295 83 299 Q88 303 103 302 Q108 301 105 296 L100 288Z"/>';
    body.append(base);
    if(!mini){const muscles=document.createElementNS(NS,'g');muscles.setAttribute('aria-hidden','true');muscles.innerHTML=view==='front'?`
      <g class="muscle-light"><ellipse cx="53" cy="68" rx="10" ry="8"/><ellipse cx="107" cy="68" rx="10" ry="8"/></g>
      <path class="muscle" d="M77 65 C70 62 59 64 56 70 C52 76 57 85 64 88 C70 90 76 86 79 82Z M83 65 C90 62 101 64 104 70 C108 76 103 85 96 88 C90 90 84 86 81 82Z"/>
      <path class="muscle-dark" d="M77 66 Q80 64 83 66 L82 84 Q80 86 78 84Z"/>
      <path class="muscle-light" d="M43 76 C39 82 37 94 35 105 L31 132 Q35 138 40 134 L50 104 L57 82Z M117 76 C121 82 123 94 125 105 L129 132 Q125 138 120 134 L110 104 L103 82Z"/>
      <path class="muscle" d="M45 83 C41 88 40 99 41 107 L47 111 L54 91 L55 82Z M115 83 C119 88 120 99 119 107 L113 111 L106 91 L105 82Z"/>
      <path class="muscle-light" d="M31 139 Q28 142 27 150 L25 158 Q27 162 30 159 L36 147 L40 143Z M129 139 Q132 142 133 150 L135 158 Q133 162 130 159 L124 147 L120 143Z"/>
      <path class="muscle" d="M67 93 Q72 90 78 92 L78 105 Q73 108 68 104Z M82 92 Q88 90 93 93 L92 104 Q87 108 82 105Z M67 107 Q72 105 78 107 L78 119 Q73 121 68 118Z M82 107 Q88 105 93 107 L92 118 Q87 121 82 119Z M68 121 Q73 120 78 122 L77 132 Q72 134 68 131Z M82 122 Q87 120 92 121 L92 131 Q88 134 83 132Z"/>
      <path class="muscle-dark" d="M58 96 Q63 91 67 94 L66 126 Q63 134 60 136 L56 128Z M102 96 Q97 91 93 94 L94 126 Q97 134 100 136 L104 128Z"/>
      <path class="muscle-light" d="M62 148 C57 156 58 176 60 194 L63 211 Q67 217 72 212 L77 170 L77 151Z M98 148 C103 156 102 176 100 194 L97 211 Q93 217 88 212 L83 170 L83 151Z"/>
      <path class="muscle" d="M67 153 C63 161 64 180 67 197 L70 207 L75 169 L76 154Z M93 153 C97 161 96 180 93 197 L90 207 L85 169 L84 154Z"/>
      <path class="muscle-dark" d="M77 153 Q80 149 83 153 L82 207 Q80 211 78 207Z"/>
      <path class="muscle-light" d="M64 226 C60 235 62 252 67 274 L71 278 L76 246 L74 229Z M96 226 C100 235 98 252 93 274 L89 278 L84 246 L86 229Z"/>
      <path class="muscle" d="M67 230 C64 241 67 256 70 267 L74 250 L75 231Z M93 230 C96 241 93 256 90 267 L86 250 L85 231Z"/>
      <path class="anatomy-line" d="M80 86 L80 137 M58 72 Q65 67 74 71 M102 72 Q95 67 86 71 M63 139 Q71 143 78 139 M97 139 Q89 143 82 139 M56 215 Q67 220 77 215 M104 215 Q93 220 83 215 M69 279 L69 289 M91 279 L91 289"/>
      `:`
      <g class="muscle-light"><ellipse cx="53" cy="68" rx="10" ry="8"/><ellipse cx="107" cy="68" rx="10" ry="8"/></g>
      <path class="muscle" d="M59 64 Q69 59 80 64 Q91 59 101 64 L96 83 Q90 88 80 91 Q70 88 64 83Z"/>
      <path class="muscle-light" d="M45 81 C40 88 40 101 43 111 L49 108 L55 86Z M115 81 C120 88 120 101 117 111 L111 108 L105 86Z"/>
      <path class="muscle" d="M50 83 Q45 95 47 109 L54 106 L58 87Z M110 83 Q115 95 113 109 L106 106 L102 87Z"/>
      <path class="muscle-dark" d="M63 82 Q70 87 77 89 L77 129 Q71 135 64 132 L58 112Z M97 82 Q90 87 83 89 L83 129 Q89 135 96 132 L102 112Z"/>
      <path class="muscle-light" d="M72 89 Q80 94 88 89 L91 130 Q86 138 80 139 Q74 138 69 130Z"/>
      <path class="anatomy-line" d="M80 61 L80 143 M64 88 Q71 96 77 98 M96 88 Q89 96 83 98 M67 106 Q73 112 77 111 M93 106 Q87 112 83 111 M68 119 Q73 125 77 123 M92 119 Q87 125 83 123"/>
      <path class="muscle" d="M64 148 C59 157 60 179 63 196 L67 211 Q72 216 76 209 L78 159Z M96 148 C101 157 100 179 97 196 L93 211 Q88 216 84 209 L82 159Z"/>
      <path class="muscle-dark" d="M72 154 Q76 150 79 154 L78 204 Q75 211 70 210 L68 188Z M88 154 Q84 150 81 154 L82 204 Q85 211 90 210 L92 188Z"/>
      <path class="muscle-light" d="M64 226 C60 236 62 255 67 274 L71 278 L76 246 L74 230Z M96 226 C100 236 98 255 93 274 L89 278 L84 246 L86 230Z"/>
      <path class="muscle" d="M67 230 C64 241 67 256 70 267 L74 250 L75 231Z M93 230 C96 241 93 256 90 267 L86 250 L85 231Z"/>
      <path class="anatomy-line" d="M57 76 Q62 80 67 80 M103 76 Q98 80 93 80 M62 137 Q70 141 78 137 M98 137 Q90 141 82 137 M60 214 Q70 219 78 214 M100 214 Q90 219 82 214 M69 279 L69 289 M91 279 L91 289"/>
      `;body.append(muscles)}
    (shapes[view]||[]).forEach(item=>{const el=makeShape(item,mini);if(mini)el.setAttribute('class','body-base');body.append(el);if(mini&&heatIds.includes(item[0])){const count=getRegionCounts()[item[0]]||0;el.style.fill=count>=4?'#174782':(count>=2?'#84acd8':'#e4edf7')}});
    if(!mini){const title=document.createElementNS(NS,'text');title.setAttribute('x','80');title.setAttribute('y','324');title.setAttribute('class','region-label');title.textContent=view==='front'?'FRENTE':'COSTAS';body.append(title)}
    svg.append(body);
    return svg}
  let selectedRegions=new Set();
  function drawBody(){const stage=document.getElementById('bodyStage');stage.innerHTML='';const frame=document.createElement('div');frame.className='body-figure';frame.append(createFigure(bodyView));stage.append(frame);stage.querySelectorAll('.region').forEach(el=>{const selected=selectedRegions.has(el.dataset.region);if(selected)el.classList.add('selected');el.setAttribute('aria-pressed',String(selected));el.addEventListener('click',()=>toggleRegion(el.dataset.region));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleRegion(el.dataset.region)}})})}
  function toggleRegion(id){if(document.getElementById('noPain').checked){document.getElementById('noPain').checked=false}if(selectedRegions.has(id))selectedRegions.delete(id);else selectedRegions.add(id);drawBody();drawSelected()}
  function drawSelected(){const box=document.getElementById('selectedList');if(!selectedRegions.size){box.innerHTML='<span class="note">Nenhuma região selecionada</span>';return}box.innerHTML='';selectedRegions.forEach(id=>{const chip=document.createElement('span');chip.className='region-chip';chip.textContent=regionNames[id];const x=document.createElement('button');x.type='button';x.setAttribute('aria-label','Remover '+regionNames[id]);x.textContent='×';x.onclick=()=>{selectedRegions.delete(id);drawBody();drawSelected()};chip.append(x);box.append(chip)})}
  function initScales(){document.querySelectorAll('.scale').forEach(group=>{const max=Number(group.dataset.max);group.setAttribute('role','group');group.setAttribute('aria-label',group.closest('.field')?.querySelector('label')?.textContent||'Escala');group.innerHTML='';for(let i=1;i<=max;i++){const b=document.createElement('button');b.type='button';b.className='scale-btn';b.textContent=i;b.dataset.value=i;b.setAttribute('aria-pressed','false');b.onclick=()=>{group.querySelectorAll('button').forEach(x=>{x.classList.remove('selected');x.setAttribute('aria-pressed','false')});b.classList.add('selected');b.setAttribute('aria-pressed','true');group.dataset.value=i;if(group.dataset.name==='esforco')document.getElementById('effortNote').textContent=effortDescription(i)};group.append(b)}})}
  function effortDescription(n){return ({1:'Pouco esforço',2:'Fácil',3:'Moderado leve',4:'Um pouco difícil',5:'Difícil moderado',6:'Intenso',7:'Muito intenso',8:'Muito pesado',9:'Extremamente pesado',10:'Esforço máximo'})[n]||'Selecione uma nota.'}
  async function loadRecords(){
    // Avaliações são dados da comissão; após o envio, atletas não podem chamar esse endpoint.
    if(role==='athlete')return;
    try{
      const response=await apiFetch('/api/evaluations');
      if(!response.ok)throw new Error('Não foi possível carregar as avaliações do banco.');
      records=await response.json();
      renderReports();
      renderDashboard();
    }catch(error){
      console.error(error);
      toast(error.message||'Erro ao carregar os dados do banco.');
    }
  }
  function go(page){if(role==='athlete'&&!['pre','post'].includes(page))return;if(role!=='athlete'&&['pre','post'].includes(page))return;currentPage=page;document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));document.getElementById('page-'+page).classList.remove('hidden');document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));document.getElementById('crumbText').textContent=names[page];if(page==='reports')loadRecords();if(page==='athletes'){loadAthletes();loadAdminTrainingSessions()}if(role==='athlete'&&['pre','post'].includes(page))loadAthleteTrainingSessions();window.scrollTo({top:0,behavior:'smooth'})}
  document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{bodyView=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));drawBody()}));
  document.getElementById('noPain').addEventListener('change',e=>{if(e.target.checked){selectedRegions.clear();drawBody();drawSelected()}});
  async function loadAthletes(){
    const list=document.getElementById('athleteList');list.innerHTML='<span class="note">Carregando…</span>';
    try{const response=await apiFetch('/api/admin/athletes');const result=await response.json();if(!response.ok)throw new Error(result.message||'Não foi possível carregar os atletas.');
      list.innerHTML=result.length?'<table class="table"><thead><tr><th>NOME</th><th>USUÁRIO</th><th>STATUS</th></tr></thead><tbody>'+result.map(a=>`<tr><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.username)}</td><td>${a.active?'Ativo':'Inativo'}</td></tr>`).join('')+'</tbody></table>':'<div class="empty">Nenhum atleta cadastrado.</div>';
    }catch(error){list.innerHTML='<div class="empty">'+escapeHtml(error.message||'Erro ao carregar atletas.')+'</div>'}
  }
  function escapeHtml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
  function sessionTypeLabel(value){return value==='Match'?'Partida':'Treino'}
  function sessionLabel(item){const date=new Date(item.startsAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});return `${date} · ${sessionTypeLabel(item.sessionType)}${item.description?' · '+item.description:''}`}
  async function loadAdminTrainingSessions(){
    const list=document.getElementById('trainingSessionList');list.innerHTML='<span class="note">Carregando sessões…</span>';
    try{const response=await apiFetch('/api/admin/training-sessions');const result=await response.json();if(!response.ok)throw new Error(result.message||'Não foi possível carregar as sessões.');
      list.innerHTML=result.length?'<table class="table"><thead><tr><th>DATA E HORA</th><th>TIPO</th><th>DESCRIÇÃO</th></tr></thead><tbody>'+result.map(item=>`<tr><td>${escapeHtml(sessionLabel(item).split(' · ').slice(0,2).join(' · '))}</td><td>${escapeHtml(sessionTypeLabel(item.sessionType))}</td><td>${escapeHtml(item.description||'—')}</td></tr>`).join('')+'</tbody></table>':'<div class="empty">Nenhuma sessão cadastrada.</div>';
    }catch(error){list.innerHTML='<div class="empty">'+escapeHtml(error.message||'Erro ao carregar sessões.')+'</div>'}
  }
  document.getElementById('refreshTrainingSessions').addEventListener('click',loadAdminTrainingSessions);
  document.getElementById('trainingSessionCreateForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;authMessage('trainingSessionAdminMessage','Cadastrando sessão…');
    try{const response=await apiFetch('/api/admin/training-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startsAt:form.startsAt.value,sessionType:form.sessionType.value,description:form.description.value})});const result=await response.json();if(!response.ok)throw new Error(result.message||'Não foi possível cadastrar a sessão.');
      form.reset();authMessage('trainingSessionAdminMessage','Sessão cadastrada. Ela já está disponível para os atletas.');await loadAdminTrainingSessions();
    }catch(error){authMessage('trainingSessionAdminMessage',error.message||'Erro ao cadastrar sessão.',true)}
  });
  async function loadAthleteTrainingSessions(){
    const selects=[['pre','preTrainingSession'],['post','postTrainingSession']].map(([kind,id])=>({kind,el:document.getElementById(id),previous:document.getElementById(id).value}));
    selects.forEach(x=>{x.el.innerHTML='<option value="">Carregando sessões…</option>';x.el.disabled=true});
    try{
      const response=await apiFetch('/api/athlete/training-sessions');const result=await response.json();if(!response.ok)throw new Error(result.message||'Não foi possível carregar as sessões.');
      athleteSessions=result;
      selects.forEach(({kind,el,previous})=>{
        const submittedKey=kind==='pre'?'preSubmitted':'postSubmitted';
        if(!result.length){el.innerHTML='<option value="">Nenhuma sessão cadastrada</option>';return}
        const pending=result.filter(item=>!item[submittedKey]);
        el.innerHTML='<option value="">'+(pending.length?'Selecione uma sessão':'Nenhuma sessão pendente')+'</option>'+result.map(item=>`<option value="${item.id}"${item[submittedKey]?' disabled':''}>${escapeHtml(sessionLabel(item))}${item[submittedKey]?' · Já respondida':''}</option>`).join('');
        const previousIsPending=pending.some(item=>String(item.id)===previous);
        const chosen=previousIsPending?previous:(pending[0]?.id??'');
        el.value=String(chosen);el.disabled=false;
      });
      updateAthleteFormState('pre');updateAthleteFormState('post');
    }catch(error){
      athleteSessions=[];selects.forEach(({el})=>{el.innerHTML='<option value="">Erro ao carregar sessões</option>'});
      document.getElementById('preSessionStatus').textContent=error.message;document.getElementById('postSessionStatus').textContent=error.message;
      document.getElementById('preSubmitButton').disabled=true;document.getElementById('postSubmitButton').disabled=true;
    }
  }
  function updateAthleteFormState(kind){
    const select=document.getElementById(kind==='pre'?'preTrainingSession':'postTrainingSession');
    const status=document.getElementById(kind==='pre'?'preSessionStatus':'postSessionStatus');
    const button=document.getElementById(kind==='pre'?'preSubmitButton':'postSubmitButton');
    const selected=athleteSessions.find(item=>String(item.id)===select.value);
    const alreadySubmitted=!!selected&&(kind==='pre'?selected.preSubmitted:selected.postSubmitted);
    button.disabled=!selected||alreadySubmitted;
    if(!selected){const hasPending=athleteSessions.some(item=>!(kind==='pre'?item.preSubmitted:item.postSubmitted));status.textContent=hasPending?'Selecione uma sessão para continuar.':athleteSessions.length?'Todas as sessões disponíveis já foram respondidas.':'A comissão ainda não cadastrou sessões de treino.';}
    else if(alreadySubmitted)status.textContent='Esta avaliação já foi enviada para a sessão selecionada.';
    else status.textContent=kind==='pre'?`Uma resposta pré-treino para ${sessionLabel(selected)}.`:`Uma resposta pós-treino para ${sessionLabel(selected)}.`;
  }
  document.getElementById('preTrainingSession').addEventListener('change',()=>updateAthleteFormState('pre'));
  document.getElementById('postTrainingSession').addEventListener('change',()=>updateAthleteFormState('post'));
  document.getElementById('refreshAthletes').addEventListener('click',loadAthletes);
  document.getElementById('athleteCreateForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;authMessage('athleteAdminMessage','Criando usuário…');
    try{const response=await apiFetch('/api/admin/athletes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.name.value,username:form.username.value,password:form.password.value})});const result=await response.json();if(!response.ok)throw new Error(result.message||'Não foi possível criar o acesso.');form.reset();authMessage('athleteAdminMessage','Acesso criado para '+result.name+'.');await loadAthletes()}
    catch(error){authMessage('athleteAdminMessage',error.message||'Erro ao criar acesso.',true)}
  });
  function resetScales(form){form.querySelectorAll('.scale').forEach(g=>{delete g.dataset.value;g.querySelectorAll('button').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false')})})}
  function validatePre(form){if(!form.trainingSessionId.value||document.getElementById('preSubmitButton').disabled){toast('Selecione uma sessão ainda não respondida.');form.trainingSessionId.focus();return false}for(const group of form.querySelectorAll('.scale')){if(!group.dataset.value){const label=group.getAttribute('aria-label');toast('Responda: '+label+'.');group.querySelector('button')?.focus();return false}}if(!form.sonoHoras.value){toast('Informe quantas horas você dormiu.');form.sonoHoras.focus();return false}if(!document.getElementById('noPain').checked&&!selectedRegions.size){toast('Selecione uma região no mapa ou marque “Não estou sentindo dor”.');document.getElementById('noPain').focus();return false}return true}
  document.getElementById('preForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const form=e.currentTarget;
    if(!validatePre(form))return;
    const values={};
    form.querySelectorAll('.scale').forEach(group=>values[group.dataset.name]=Number(group.dataset.value));
    const noPain=document.getElementById('noPain').checked;
    const payload={
      trainingSessionId:Number(form.trainingSessionId.value),
      recovery:values.recuperacao,
      sleepHours:Number(form.sonoHoras.value),
      sleepQuality:values.sonoQualidade,
      stress:values.estresse,
      muscleFatigue:values.fadiga,
      hydration:values.hidratacao,
      noPain,
      painRegions:noPain?[]:[...selectedRegions]
    };
    try{
      const response=await apiFetch('/api/evaluations/pre',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.message||'Não foi possível salvar a avaliação.');
      toast('Avaliação pré-treino salva.');
      form.reset();selectedRegions.clear();resetScales(form);drawBody();drawSelected();
      await loadAthleteTrainingSessions();
      await loadRecords();
    }catch(error){console.error(error);toast(error.message||'Erro ao enviar a avaliação para a API.');}
  });
  document.getElementById('postForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const form=e.currentTarget;
    if(!form.trainingSessionId.value||document.getElementById('postSubmitButton').disabled){toast('Selecione uma sessão ainda não respondida.');form.trainingSessionId.focus();return;}
    const effort=document.querySelector('#postForm .scale');
    if(!effort.dataset.value){toast('Selecione sua percepção de esforço.');effort.querySelector('button')?.focus();return;}
    if(!form.duracao.value){toast('Informe quantos minutos você treinou.');form.duracao.focus();return;}
    const payload={
      trainingSessionId:Number(form.trainingSessionId.value),
      effort:Number(effort.dataset.value),
      durationMinutes:Number(form.duracao.value)
    };
    try{
      const response=await apiFetch('/api/evaluations/post',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.message||'Não foi possível salvar a avaliação.');
      toast('Avaliação pós-treino salva.');
      form.reset();resetScales(form);
      document.getElementById('effortNote').textContent='Escolha uma nota para ver a descrição correspondente.';
      await loadAthleteTrainingSessions();
      await loadRecords();
    }catch(error){console.error(error);toast(error.message||'Erro ao enviar a avaliação para a API.');}
  });
  function toast(text){const el=document.getElementById('toast');el.textContent=text;el.classList.remove('hidden');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.add('hidden'),2800)}
  function renderLatest(){
    const rows=document.getElementById('latestRows');
    const latest=records.slice(0,4);
    rows.innerHTML=latest.length?latest.map(record=>`<tr><td>${escapeHtml(record.athlete)}</td><td>${record.type==='Pós-treino'?`Esforço ${record.esforco}/10`:record.recuperacao+'/10'}</td><td>${escapeHtml(record.regioes?.length?record.regioes.map(id=>regionNames[id]||id).join(', '):record.semDor?'Sem dor':'—')}</td><td>${escapeHtml(record.trainingSession?sessionLabel(record.trainingSession):record.type)}</td><td><span class="tag good">No sistema</span></td></tr>`).join(''):'<tr><td colspan="5" class="empty">Nenhuma avaliação encontrada.</td></tr>';
  }
  function getRegionCounts(){
    const cutoff=new Date();cutoff.setHours(0,0,0,0);cutoff.setDate(cutoff.getDate()-6);
    const counts={};records.filter(record=>record.type==='Pré-treino'&&new Date(record.timestamp)>=cutoff).forEach(record=>(record.regioes||[]).forEach(id=>counts[id]=(counts[id]||0)+1));
    return counts;
  }
  function renderHeat(){const el=document.getElementById('miniHeat');el.innerHTML='';el.append(createFigure('front',true),createFigure('back',true))}
  function renderDashboard(){
    const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-6);
    const today=new Date();today.setHours(0,0,0,0);
    const lastSeven=records.filter(record=>new Date(record.timestamp)>=start);
    const todayCount=records.filter(record=>new Date(record.timestamp)>=today).length;
    const pres=lastSeven.filter(record=>record.type==='Pré-treino');
    const posts=lastSeven.filter(record=>record.type==='Pós-treino');
    const avg=(items,key)=>items.length?items.reduce((total,item)=>total+Number(item[key]||0),0)/items.length:null;
    const recovery=avg(pres,'recuperacao');
    const workload=posts.length?posts.reduce((total,item)=>total+Number(item.esforco||0)*Number(item.duracao||0),0)/posts.length:null;
    const painRecords=pres.filter(record=>record.regioes?.length);
    const distinctRegions=new Set(painRecords.flatMap(record=>record.regioes||[]));
    document.getElementById('statReplies').textContent=String(todayCount);
    document.getElementById('statRecovery').textContent=recovery===null?'—':recovery.toFixed(1).replace('.',',');
    document.getElementById('statPain').textContent=String(painRecords.length);
    document.getElementById('statPainNote').textContent=`${distinctRegions.size} região${distinctRegions.size===1?'':'ões'} · últimos 7 dias`;
    document.getElementById('statLoad').textContent=workload===null?'—':Math.round(workload).toLocaleString('pt-BR');
    renderTrendChart();renderHeat();
  }
  function renderTrendChart(){
    const svg=document.getElementById('trendChart');svg.replaceChildren();
    const add=(tag,attrs,textValue)=>{const node=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,String(value)));if(textValue)node.textContent=textValue;svg.append(node);return node};
    [25,70,115,160].forEach((y,index)=>{add('line',{class:'gridline',x1:45,y1:y,x2:585,y2:y});add('text',{x:8,y:y+4},String([10,7,4,1][index]))});
    const dates=[];const base=new Date();base.setHours(0,0,0,0);base.setDate(base.getDate()-6);
    for(let i=0;i<7;i++){const day=new Date(base);day.setDate(base.getDate()+i);dates.push(day);add('text',{x:48+i*80,y:190,'text-anchor':'middle'},day.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.',''))}
    const series=[{type:'Pré-treino',key:'recuperacao',color:'#174782',label:'Recuperação'},{type:'Pré-treino',key:'fadiga',color:'#84acd8',label:'Fadiga'}];
    const xAt=index=>55+index*80;const yAt=value=>160-((Number(value)-1)/9)*135;
    series.forEach(item=>{
      const points=dates.map(day=>{const next=new Date(day);next.setDate(next.getDate()+1);const values=records.filter(record=>record.type===item.type&&new Date(record.timestamp)>=day&&new Date(record.timestamp)<next).map(record=>Number(record[item.key])).filter(Number.isFinite);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null});
      let path='';let open=false;
      points.forEach((value,index)=>{if(value===null){open=false;return}path+=(open?' L ':'M ')+xAt(index)+' '+yAt(value);open=true;add('circle',{cx:xAt(index),cy:yAt(value),r:3.5,fill:item.color})});
      if(path)add('path',{d:path,fill:'none',stroke:item.color,'stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'});
    });
    add('text',{x:390,y:17,fill:'#174782'},'● Recuperação');add('text',{x:500,y:17,fill:'#84acd8'},'● Fadiga');
    if(!records.some(record=>record.type==='Pré-treino'&&new Date(record.timestamp)>=base))add('text',{x:300,y:102,'text-anchor':'middle',fill:'#8398ae'},'Sem avaliações pré-treino nos últimos 7 dias');
  }
  function renderReports(){
    const painCount=records.filter(record=>record.type==='Pré-treino'&&record.regioes?.length).length;
    const posts=records.filter(record=>record.type==='Pós-treino');
    document.getElementById('reportCount').textContent=records.length;
    document.getElementById('reportPain').textContent=painCount;
    document.getElementById('reportEffort').textContent=posts.length?(posts.reduce((sum,record)=>sum+Number(record.esforco||0),0)/posts.length).toFixed(1).replace('.',','):'—';
    document.getElementById('reportDuration').textContent=posts.length?Math.round(posts.reduce((sum,record)=>sum+Number(record.duracao||0),0)/posts.length)+' min':'—';
    document.getElementById('localRecordCount').textContent=records.length+' registro'+(records.length===1?'':'s');
    const localRows=document.getElementById('localRows');
    localRows.innerHTML=records.length?records.map(record=>`<tr><td>${new Date(record.timestamp).toLocaleString('pt-BR')}</td><td>${escapeHtml(record.athlete)}</td><td><span class="tag">${escapeHtml(record.type)}</span></td><td>${escapeHtml(record.trainingSession?sessionLabel(record.trainingSession):'Sessão não vinculada')} · ${escapeHtml(record.type==='Pós-treino'?`Esforço ${record.esforco}/10 · ${record.duracao} min`:(record.semDor?'Sem dor':(record.regioes||[]).map(id=>regionNames[id]||id).join(', ')||'Avaliação registrada'))}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">Nenhuma avaliação encontrada.</td></tr>';
    const stats={};
    records.filter(record=>record.type==='Pré-treino').forEach(record=>(record.regioes||[]).forEach(id=>stats[id]=(stats[id]||0)+1));
    const arr=Object.entries(stats).map(([key,value])=>[regionNames[key]||key,value]);
    document.getElementById('regionBars').innerHTML=arr.length?arr.sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,value])=>`<div class="bar-row"><span>${name}</span><div class="bar"><span style="width:${Math.min(100,Math.max(12,value*10))}%"></span></div><strong>${value}</strong></div>`).join(''):'<div class="empty">Nenhuma região relatada.</div>';
    renderLatest();
  }
  function exportCsv(){const headers=['Data e hora','Atleta','Tipo','Sessão','Recuperação','Horas de sono','Qualidade do sono','Estresse','Fadiga','Hidratação','Regiões relatadas','Sem dor','Percepção de esforço','Duração (minutos)'];const lines=[headers,...records.map(r=>[new Date(r.timestamp).toLocaleString('pt-BR'),r.athlete,r.type,r.trainingSession?sessionLabel(r.trainingSession):'',r.recuperacao??'',r.sonoHoras??'',r.sonoQualidade??'',r.estresse??'',r.fadiga??'',r.hidratacao??'',(r.regioes||[]).map(id=>regionNames[id]).join('; '),r.semDor?'Sim':'Não',r.esforco??'',r.duracao??''])].map(row=>row.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(';')).join('\r\n');const blob=new Blob(['\ufeff'+lines],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='relatorio-bem-estar.csv';a.click();URL.revokeObjectURL(a.href);toast('Relatório CSV exportado.')}
  document.getElementById('exportCsv').onclick=exportCsv;document.getElementById('exportCsv2').onclick=exportCsv;
  initScales();drawBody();drawSelected();renderHeat();renderLatest();
  initializeAuth();
