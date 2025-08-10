/* Neighborly - script.js
   Single-file app logic: tasks, skills, leaderboard, thanks, auto-expiry, localStorage.
*/

(() => {
  // ---- Utilities ----
  const qs = s => document.querySelector(s);
  const qsa = s => Array.from(document.querySelectorAll(s));
  const now = () => Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;

  // ---- Storage keys ----
  const KEYS = {
    TASKS: 'neighborly_tasks',
    HELPERS: 'neighborly_helpers',
    SKILLS: 'neighborly_skills',
    THANKS: 'neighborly_thanks'
  };

  // ---- Data helpers ----
  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch(e){ return fallback; }
  }
  function save(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

  // ---- App state ----
  let tasks = load(KEYS.TASKS, []);
  let helpers = load(KEYS.HELPERS, {}); // {name: count}
  let skills = load(KEYS.SKILLS, []);
  let thanks = load(KEYS.THANKS, []);

  // ---- DOM nodes ----
  const taskForm = qs('#taskForm');
  const tasksEl = qs('#tasks');
  const leaderboardEl = qs('#leaderboard');
  const skillsList = qs('#skillsList');
  const skillForm = qs('#skillForm');
  const thanksList = qs('#thanksList');
  const thankForm = qs('#thankForm');
  const yearEl = qs('#year');
  const filterNeighborhood = qs('#filterNeighborhood');
  const neighborhoodSelect = qs('#neighborhood');
  const searchInput = qs('#search');

  yearEl.textContent = new Date().getFullYear();

  // Populate neighborhood filters
  function syncNeighborhoods(){
    const set = new Set(tasks.map(t => t.neighborhood || 'My Street'));
    // include current select choices
    qsa('#neighborhood option').forEach(opt => set.add(opt.value));
    filterNeighborhood.innerHTML = '';
    Array.from(set).forEach(n=>{
      const o = document.createElement('option'); o.textContent = n; o.value = n;
      filterNeighborhood.appendChild(o);
    });
    // keep selected same if possible
  }
  syncNeighborhoods();

  // ---- Category icons ----
  const CATEGORY_ICONS = {
    "Errands":"🛒",
    "Repair":"🔧",
    "Pet Care":"🐾",
    "Lend/Borrow":"🤝",
    "Other":"✨"
  };

  // ---- Render functions ----
  function renderTasks(filterText='') {
    // cleanup expired
    const before = tasks.length;
    tasks = tasks.filter(t => (now() - t.postedAt) < DAY_MS);
    if (tasks.length !== before) save(KEYS.TASKS, tasks);
    syncNeighborhoods();

    tasksEl.innerHTML = '';
    // sort urgent first, then newest
    const visibleNeighborhood = filterNeighborhood.value || neighborhoodSelect.value;
    const q = (searchInput.value || '').toLowerCase();

    const sorted = tasks
      .filter(t => t.neighborhood === visibleNeighborhood || !visibleNeighborhood)
      .filter(t => {
        if (!q) return true;
        return (t.title+t.description+t.category).toLowerCase().includes(q);
      })
      .sort((a,b) => (b.urgent - a.urgent) || (b.postedAt - a.postedAt));

    sorted.forEach((task, i) => {
      const card = document.createElement('article');
      card.className = 'task card';
      card.dataset.reveal = '';
      if (task.urgent && (now() - task.urgentAt) < HOUR_MS) card.classList.add('urgent');
      card.innerHTML = `
        <div class="meta">
          <div class="icon">${CATEGORY_ICONS[task.category] || '✨'}</div>
          <div style="flex:1">
            <div class="title-row">
              <div>
                <h4>${escapeHtml(task.title)}</h4>
                <div class="desc">${escapeHtml(task.description || '')}</div>
              </div>
              <div style="text-align:right">
                <div class="badges">
                  <span class="badge clock">⏱ ${task.timeNeeded}m</span>
                  <span class="badge">${escapeHtml(task.payment)}</span>
                  ${task.urgent && (now() - task.urgentAt) < HOUR_MS ? '<span class="badge" style="color:'+getComputedStyle(document.documentElement).getPropertyValue('--cta')+'">🚨 URGENT</span>' : ''}
                </div>
                <div style="font-size:12px;color:rgba(0,0,0,0.45);margin-top:6px">${escapeHtml(task.location || '')} • ${escapeHtml(task.safePoint || '')}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="task-actions">
          <button class="btn small-btn" data-action="repost">↺ Repost</button>
          <button class="btn small-btn" data-action="help">✅ I helped</button>
          <button class="btn small-btn" data-action="thank">💌 Thank</button>
          <button class="btn small-btn" data-action="delete">🗑 Delete</button>
        </div>
      `;

      // Attach handlers
      card.querySelector('[data-action="delete"]').addEventListener('click',()=>{
        tasks = tasks.filter(t => t.id !== task.id); save(KEYS.TASKS,tasks); renderTasks();
      });
      card.querySelector('[data-action="repost"]').addEventListener('click',()=>{
        const newTask = {...task, id: 't_'+Math.random().toString(36).slice(2,9), postedAt: now()};
        tasks.unshift(newTask); save(KEYS.TASKS,tasks); renderTasks();
      });
      card.querySelector('[data-action="help"]').addEventListener('click', async ()=>{
        const nickname = prompt('Your helper nickname (short):') || 'Helper';
        helpers[nickname] = (helpers[nickname]||0) + 1;
        save(KEYS.HELPERS,helpers);
        // optionally remove task (simulate completion)
        const remove = confirm('Remove task from board? (You can choose to keep it)');
        if(remove){ tasks = tasks.filter(t => t.id !== task.id); save(KEYS.TASKS,tasks); }
        renderLeaderboard(); renderTasks();
      });
      card.querySelector('[data-action="thank"]').addEventListener('click', ()=>{
        const msg = prompt('Write a short anonymous thank-you (max 140 chars):');
        if(msg && msg.trim()){
          thanks.unshift({text: msg.trim(), at: now()});
          save(KEYS.THANKS,thanks); renderThanks();
        }
      });

      tasksEl.appendChild(card);
      // reveal stagger
      setTimeout(()=>{ card.classList.add('show'); card.setAttribute('data-reveal',''); }, 80*i);
    });
  }

  function renderLeaderboard(){
    // sort helpers
    const entries = Object.entries(helpers).sort((a,b)=>b[1]-a[1]).slice(0,10);
    leaderboardEl.innerHTML = '';
    entries.forEach(([name,count],i)=>{
      const li = document.createElement('li');
      li.innerHTML = `<span>${escapeHtml(name)}</span><span class="count" data-count="${count}">0</span>`;
      leaderboardEl.appendChild(li);
    });
    // count up animation
    qsa('#leaderboard .count').forEach(span=>{
      const target = +span.dataset.count;
      let cur=0;
      const step = Math.max(1, Math.ceil(target/30));
      const id = setInterval(()=>{
        cur += step;
        if(cur >= target){ cur = target; clearInterval(id); }
        span.textContent = cur;
      }, 20);
    });
  }

  function renderSkills(){
    skillsList.innerHTML = '';
    skills.forEach(s=>{
      const li = document.createElement('li');
      li.textContent = `${s.nick} — ${s.skill}`;
      skillsList.appendChild(li);
    });
  }

  function renderThanks(){
    thanksList.innerHTML = '';
    thanks.forEach(t=>{
      const li = document.createElement('li');
      li.textContent = `💬 ${t.text}`;
      thanksList.appendChild(li);
    });
  }

  // ---- Form actions ----
  taskForm.addEventListener('submit', e=>{
    e.preventDefault();
    const t = {
      id: 't_'+Math.random().toString(36).slice(2,9),
      title: qs('#title').value.trim(),
      description: qs('#description').value.trim(),
      category: qs('#category').value,
      timeNeeded: Number(qs('#timeNeeded').value) || 10,
      payment: qs('#payment').value,
      contact: qs('#contact').value.trim(),
      location: qs('#location').value.trim(),
      safePoint: qs('#safePoint').value,
      neighborhood: qs('#neighborhood').value,
      postedAt: now(),
      urgent: !!qs('#urgent').checked,
      urgentAt: qs('#urgent').checked ? now() : 0
    };
    // validation
    if(!t.title){ alert('Add a short title'); return; }
    tasks.unshift(t); save(KEYS.TASKS,tasks);
    taskForm.reset(); renderTasks(); renderLeaderboard(); syncNeighborhoods();
  });

  skillForm.addEventListener('submit', e=>{
    e.preventDefault();
    const nick = qs('#skillName').value.trim();
    const skill = qs('#skillText').value.trim();
    if(!nick || !skill) return;
    skills.unshift({nick,skill,addedAt:now()});
    save(KEYS.SKILLS,skills); qs('#skillName').value=''; qs('#skillText').value=''; renderSkills();
  });

  thankForm.addEventListener('submit', e=>{
    e.preventDefault();
    const text = qs('#thankText').value.trim();
    if(!text) return;
    thanks.unshift({text, at: now()});
    save(KEYS.THANKS,thanks); qs('#thankText').value=''; renderThanks();
  });

  // delete expired periodically and update UI for urgent
  function cleanupLoop(){
    const before = tasks.length;
    tasks = tasks.filter(t => (now() - t.postedAt) < DAY_MS);
    if(tasks.length !== before) save(KEYS.TASKS,tasks);
    renderTasks();
    renderLeaderboard();
    setTimeout(cleanupLoop, 5 * 60 * 1000); // every 5 minutes
  }

  // initial render
  renderTasks();
  renderLeaderboard();
  renderSkills();
  renderThanks();

  // search and filter events
  filterNeighborhood.addEventListener('change', renderTasks);
  searchInput.addEventListener('input', () => renderTasks());

  // thanks and helpers persist render on load
  window.addEventListener('load', ()=>{
    // reveal scroll-triggered
    const obs = new IntersectionObserver((entries)=>{
      entries.forEach(en=>{
        if(en.isIntersecting) en.target.classList.add('revealed');
      });
    }, {threshold: 0.08});
    qsa('[data-reveal]').forEach(el => obs.observe(el));
  });

  // helper: escape HTML
  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Start cleanup loop
  cleanupLoop();

  // Keep storage updated periodically
  setInterval(()=>{ save(KEYS.TASKS,tasks); save(KEYS.HELPERS,helpers); save(KEYS.SKILLS,skills); save(KEYS.THANKS,thanks); }, 30*1000);

  // Expose small debug helpers (optional)
  window.Neighborly = { tasks, helpers, skills, thanks };

  // Initial neat animation: small delay reveal for task area
  setTimeout(()=>{ qsa('.card').forEach((c,i)=>setTimeout(()=>c.classList.add('revealed'), i*40)); }, 120);
})();
