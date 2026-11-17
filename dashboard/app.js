// Token Radar's dashboard. Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, filters, a per-protocol detail view
// with the model's own breakdown and the protocol's farm plan. No network:
// every byte it shows is in data.js.
//
// The farm plan below is the same derivation main.ts writes to board.json:
// category, chains, TVL, age and seven-day change decide the action, the
// capital, the hold and every cost and time. No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 10000) / 10000).toString(); }

  // The model, recomputed in the page from the row's own figures, so the
  // page checks the number board.json carries.
  function impliedOf(row) {
    return Math.max(1, Math.round(row.base_usd * row.growth_multiplier * row.maturity_multiplier * row.breadth_multiplier));
  }

  // --- farm plan: mirrors lib/model.ts farmSteps, same rules, same words ---
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 60;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 45;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + " of USDC into " + name + "'s lending market on " + chain + ' and leave the deposit earning.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s largest pool on " + chain + ', in a narrow, active range.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' with ' + name + ', then put the bridged funds to work in one app on the destination chain.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the native asset through " + name + ' and keep the liquid receipt token in the same wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Post $' + capital + ' of USDC as collateral on ' + name + ' and open a small hedged position, not a leveraged bet.';
    if (c.indexOf('prediction') >= 0) return 'Fund your ' + name + ' account with $' + capital + ' and take one position in a market you can explain.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + "'s tokenised yield product on " + chain + ' and hold it in the farming wallet.';
    if (c.indexOf('stable') >= 0) return 'Mint or hold $' + capital + ' of ' + name + "'s stablecoin on " + chain + ' through its own app.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover on ' + name + ' for a protocol you already use, and keep the policy active.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares until the season ends.';
    return 'Deposit $' + capital + ' of USDC into ' + name + "'s main product on " + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Keep the position open and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var growth = p.change_7d;
    var momentum;
    if (growth !== null && growth !== undefined && growth >= 50) {
      momentum = { text: 'TVL jumped ' + growth.toFixed(1) + '% in a week, so inflows are being counted now: keep the position through the next weekly snapshot rather than rotating out.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
    } else if (growth !== null && growth !== undefined && growth <= -20) {
      momentum = { text: 'TVL fell ' + Math.abs(growth).toFixed(1) + "% in a week: farm at half the usual size and read the protocol's own announcements before adding more.", cost: 'about $' + Math.floor(capital / 2) + ' of capital to start', time: '15 minutes of reading' };
    } else {
      momentum = { text: 'Come back once a week and do one qualifying action, such as a deposit, a swap, a vote or a claim, so the wallet stays active.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
    }
    var secondChain = (p.chains && p.chains.length >= 2)
      ? { text: 'Repeat one small action on ' + p.chains[1] + ': a deposit or swap of about $25, so the wallet is active on two of the protocol\u2019s chains.', cost: 'about $25 of capital and $2 of gas', time: '10 minutes' }
      : { text: 'Do a second, different action in the same app, such as a swap, a borrow or a vote, so the wallet shows more than a single deposit.', cost: 'about $2 of gas', time: '10 minutes' };
    return [
      { text: 'Open a fresh wallet used only for this farm and write its recovery phrase on paper, never in a screenshot or a chat.', cost: 'no cost to create the wallet', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital plus about $' + (capital >= 150 ? 8 : 4) + ' of network fees', time: '20 minutes to set up' },
      secondChain,
      momentum,
      { text: 'Keep the position open for at least ' + hold + ' days so it appears in several of the protocol\u2019s snapshots.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'When the protocol opens a points or rewards page, check it only through the link on its own site or docs, and never pay a fee to claim.', cost: 'nothing to check; a claim that asks for payment is a scam', time: '10 minutes' },
      { text: 'Keep a farm log of the wallet, the dates, the amounts and the transaction links, and plan the exit: unwind in two or three tranches instead of all at once.', cost: 'nothing but the log', time: '5 minutes a week' }
    ].map(stepText);
  }

  // --- state in the hash, so a view can be linked ---
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('w') === '1') state.watchOnly = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchOnly) params.set('w', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function isWatchlist(slug) { return DATA.watchlist.indexOf(slug) >= 0; }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchOnly && !isWatchlist(r.slug)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function sortBtn(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' \u25bc' : ' \u25b2') : '';
    return '<button type="button" data-sort="' + key + '">' + esc(label) + esc(arrow) + '</button>';
  }

  function rowHtml(r, maxImplied) {
    var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
    var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down';
    var pct = Math.max(3, Math.round((r.implied_value_usd / maxImplied) * 100));
    return '<tr data-slug="' + esc(r.slug) + '" tabindex="0" class="' + (state.selected === r.slug ? 'sel' : '') + '">' +
      '<td class="num">' + r.rank + '</td>' +
      '<td class="cell-name"><b>' + esc(r.name) + '</b><span>' + esc(r.category || 'Other') + ' on ' + esc((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') + '</span></td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + gc + '">' + growth + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td class="num">' + (r.chains || []).length + '</td>' +
      '<td><span class="bar-wrap"><span class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span><span class="num">' + fmtUsd(r.implied_value_usd) + '</span></span></td>' +
      '<td><span class="pill pre">no token</span></td></tr>';
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    var head = '<tr><th scope="col">' + sortBtn('implied', 'Rank') + '</th><th scope="col">' + sortBtn('name', 'Protocol') + '</th><th scope="col">' + sortBtn('tvl', 'TVL') + '</th><th scope="col">' + sortBtn('growth', '7d') + '</th><th scope="col">' + sortBtn('age', 'Age') + '</th><th scope="col">Chains</th><th scope="col">' + sortBtn('implied', 'Implied value') + '</th><th scope="col">Token</th></tr>';
    if (list.length === 0) {
      return '<div class="card"><div class="empty"><h2>No protocol matches that filter</h2><p>Clear the search or pick another category to see the board again.</p><button class="btn primary" type="button" id="clear-filters">Clear filters</button></div></div>';
    }
    var max = list[0].implied_value_usd || 1;
    return '<div class="card"><div class="scroll"><table><caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption><thead>' + head + '</thead><tbody>' +
      list.map(function (r) { return rowHtml(r, max); }).join('') + '</tbody></table></div></div>';
  }

  function liveTable() {
    var rows = DATA.live.map(function (r) {
      return '<tr><td><span class="pill live">live</span></td>' +
        '<td class="cell-name"><b>' + esc(r.name) + '</b><span>' + esc(r.category || 'Other') + ' on ' + esc((r.chains || []).slice(0, 2).join(', ') || 'an unnamed chain') + '</span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
        '<td><span class="pill live">already trades</span></td></tr>';
    }).join('');
    return '<div class="card"><div class="scroll"><table><caption>Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.</caption><thead><tr><th scope="col">Status</th><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th><th scope="col">Token</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function detailHtml() {
    if (!state.selected) return '';
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === state.selected) { row = DATA.rows[i]; break; }
    if (!row) return '';
    var recomputed = impliedOf(row);
    var diff = Math.abs(recomputed - row.implied_value_usd);
    var matchNote = diff <= Math.max(1, row.implied_value_usd * 0.001)
      ? 'The page recomputes this row as ' + fmtUsd(recomputed) + ', the same number board.json carries.'
      : 'The page recomputes this row as ' + fmtUsd(recomputed) + ', which differs by ' + fmtUsd(diff) + ' from the board: the data would be stale.';
    var steps = farmSteps(row).map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
    }).join('');
    return '<div class="scrim" id="scrim"></div><aside class="detail" id="detail" aria-label="Protocol detail">' +
      '<div class="detail-head"><div><span class="kick">Rank ' + row.rank + ' of ' + DATA.board_size + '</span>' +
      '<h2>' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc((row.chains || []).join(', ') || 'an unnamed chain') + '</p></div>' +
      '<button class="close" type="button" id="close-detail" aria-label="Close details">Close</button></div>' +
      '<section class="dsec"><h3>Implied value</h3><div class="kv">' +
      '<div><span>TVL</span><b>' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div><span>Seven-day growth</span><b>' + fmtPct(row.change_7d) + '</b></div>' +
      '<div><span>Age with no token</span><b>' + fmtAge(row.age_days) + '</b></div>' +
      '<div><span>Chains</span><b>' + (row.chains || []).length + '</b></div>' +
      '<div><span>Live multiple (median mcap / TVL)</span><b>' + fmtMult(row.live_multiple) + '</b></div>' +
      '<div><span>Base value (TVL x live multiple)</span><b>' + fmtUsd(row.base_usd) + '</b></div>' +
      '<div><span>Growth multiplier</span><b>' + fmtMult(row.growth_multiplier) + '</b></div>' +
      '<div><span>Maturity multiplier</span><b>' + fmtMult(row.maturity_multiplier) + '</b></div>' +
      '<div><span>Breadth multiplier</span><b>' + fmtMult(row.breadth_multiplier) + '</b></div>' +
      '<div><span>Implied value</span><b>' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '</div><p style="color:var(--muted);font-size:12px;margin-top:10px">' + esc(matchNote) + ' This is an estimate, not a price. DefiLlama records no token for this protocol; that is the record, not proof it has none.</p></section>' +
      '<section class="dsec"><h3>Farm plan</h3><ol class="steps">' + steps + '</ol></section>' +
      '</aside>';
  }

  function render() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var shown = state.tab === 'pre-token' ? filteredRows().length : DATA.live.length;
    var html = '<div class="wrap">' +
      '<header class="masthead"><div class="brand"><span class="ring" aria-hidden="true"></span><span><span class="brand-name">Token Radar</span><h1>Pre-token protocols, ranked by implied value</h1></span></div>' +
      '<div class="meta"><span>Snapshot <b>' + esc(DATA.as_of) + '</b></span><span>DefiLlama protocol index</span><span>Model <b>' + esc(DATA.model_version) + '</b></span></div></header>' +
      '<section class="intro"><div><h2>' + DATA.watchlist_size + ' watchlist protocols, plus every rankable pre-token protocol below the floor</h2>' +
      '<p>The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL</b> and no token on record. The early radar adds <b>' + DATA.early_size + ' pre-token protocols</b> below that floor. Implied value is a model built from the snapshot itself, not a promise, and never a prediction that a token will launch.</p></div>' +
      '<div class="stats">' +
      '<div class="stat"><span>Watchlist covered</span><b>' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b></div>' +
      '<div class="stat"><span>Pre-token rows scored</span><b>' + DATA.board_size + '</b></div>' +
      '<div class="stat"><span>Early rows below the floor</span><b>' + DATA.early_size + '</b></div>' +
      '<div class="stat"><span>Live multiple (median)</span><b>' + fmtMult(DATA.live_multiple) + '</b></div>' +
      '</div></section>' +
      '<div class="toolbar">' +
      '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Search name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      '<div class="field"><label for="category">Category</label><select id="category" aria-label="Filter by category"><option value="all">All categories</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain" aria-label="Filter by chain"><option value="all">All chains</option>' +
      chains.map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.chain ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<label class="check"><input type="checkbox" id="watch-only"' + (state.watchOnly ? ' checked' : '') + '> Watchlist only</label>' +
      '<div class="tabs"><button type="button" id="tab-pre" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token</button><button type="button" id="tab-live" aria-pressed="' + (state.tab === 'live') + '">Live token</button></div>' +
      '<span class="shown">' + shown + (state.tab === 'pre-token' ? ' rows shown' : ' live-token protocols') + '</span>' +
      '</div>' +
      (state.tab === 'pre-token' ? boardTable() : liveTable()) +
      (state.tab === 'pre-token'
        ? '<section class="card explain"><h2>How implied value is computed</h2>' +
          '<p>Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.</p>' +
          '<div class="formula">implied = round( tvl_usd x liveMultiple x (1 + clamp(change_7d, -80, 200) / 100 x 0.6) x maturity(age) x (1 + 0.04 x min(chains - 1, 5)) )</div>' +
          '<p><b style="color:var(--ink)">liveMultiple</b> is the median market-cap-to-TVL ratio of the snapshot\u2019s own live-token protocols (' + fmtMult(DATA.live_multiple) + ' here): the market\u2019s own pricing of a dollar of TVL. <b style="color:var(--ink)">maturity</b> rises from 0.55 to 1.00 over a protocol\u2019s first three years with no token, then tapers by up to 0.10 for older ones; an unlisted age uses 365 days. <b style="color:var(--ink)">breadth</b> rewards protocols live on more chains. The early radar is every rankable pre-token protocol below the watchlist floor, and the live-token protocols are set aside with their market caps shown.</p></section>'
        : '') +
      '<footer class="foot"><span>Snapshot: DefiLlama protocol index, fetched 2026-11-14. Board data: snapshot as of ' + esc(DATA.as_of) + '.</span><span>Implied value is the entry\u2019s own model estimate. It is not a price, not financial advice, and not a prediction that any protocol will issue a token.</span></footer>' +
      '</div>' + detailHtml();
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
    bind();
  }

  function bind() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; state.selected = null; writeHash(); render(); });
    var cat = document.getElementById('category');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var w = document.getElementById('watch-only');
    if (w) w.addEventListener('change', function () { state.watchOnly = w.checked; writeHash(); render(); });
    var tp = document.getElementById('tab-pre');
    if (tp) tp.addEventListener('click', function () { state.tab = 'pre-token'; render(); });
    var tl = document.getElementById('tab-live');
    if (tl) tl.addEventListener('click', function () { state.tab = 'live'; render(); });
    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; writeHash(); render(); });
    var sorts = app.querySelectorAll('[data-sort]');
    for (var i = 0; i < sorts.length; i++) {
      sorts[i].addEventListener('click', function (e) {
        var key = e.currentTarget.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = -1; }
        render();
      });
    }
    var rows = app.querySelectorAll('tbody tr[data-slug]');
    for (var j = 0; j < rows.length; j++) {
      rows[j].addEventListener('click', function (e) { state.selected = e.currentTarget.getAttribute('data-slug'); writeHash(); render(); });
      rows[j].addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.selected = e.currentTarget.getAttribute('data-slug'); writeHash(); render(); }
      });
    }
    var close = document.getElementById('close-detail');
    if (close) close.addEventListener('click', function () { state.selected = null; writeHash(); render(); });
    var scrim = document.getElementById('scrim');
    if (scrim) scrim.addEventListener('click', function () { state.selected = null; writeHash(); render(); });
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () {
    readHash();
    render();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) { state.selected = null; writeHash(); render(); }
  });
})();
