// ============ RENDERING ============
// The static city is pre-rendered to an offscreen canvas once; each frame we
// blit the visible part and draw entities, labels, overlays and the minimap.

const TILE_COLORS = {
  [T_ROAD]: '#26262e', [T_ALLEY]: '#1d1d24', [T_PLAZA]: '#2b2733',
  [T_WATER]: '#16314a', [T_DOCK]: '#4d4434', [T_PARK]: '#27402a',
};

Game.prototype.buildMapCache = function () {
  const c = document.createElement('canvas');
  c.width = MAP_W * TILE; c.height = MAP_H * TILE;
  const g = c.getContext('2d');
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = this.map.at(x, y);
      g.fillStyle = t === T_BLOCK ? this.map.blockColor[y * MAP_W + x] : TILE_COLORS[t];
      g.fillRect(x * TILE, y * TILE, TILE, TILE);
      if (t === T_BLOCK) { // simple rooftop shading
        g.fillStyle = 'rgba(255,255,255,0.04)';
        g.fillRect(x * TILE, y * TILE, TILE, 3);
      }
      if (t === T_ROAD && (x + y) % 4 === 0) { // road dashes
        g.fillStyle = '#3a3a44';
        g.fillRect(x * TILE + TILE / 2 - 1, y * TILE + TILE / 2 - 1, 3, 3);
      }
      if (t === T_WATER && (x * 7 + y * 13) % 11 === 0) {
        g.fillStyle = '#1d3d5c';
        g.fillRect(x * TILE + 4, y * TILE + 8, 10, 2);
      }
    }
  }
  // district labels baked into the map
  g.font = 'bold 22px monospace';
  g.fillStyle = 'rgba(255,255,255,0.13)';
  const labels = [
    ['THE SLUMS', 9, 12], ['DOWNTOWN', 42, 12], ['WAREHOUSE ROW', 64, 12],
    ['BLACK MARKET', 33, 38], ['RICH DISTRICT', 6, 42], ['THE DOCKS', 84.2, 8],
  ];
  for (const [txt, tx, ty] of labels) g.fillText(txt, tx * TILE, ty * TILE);
  this.mapCache = c;
};

Game.prototype.render = function () {
  const ctx = this.ctx, cw = this.canvas.width, ch = this.canvas.height;
  const p = this.player;
  const camX = clamp(p.x - cw / 2, 0, MAP_W * TILE - cw);
  const camY = clamp(p.y - ch / 2, 0, MAP_H * TILE - ch);

  ctx.fillStyle = '#0c0c10';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(this.mapCache, -camX, -camY);

  ctx.save();
  ctx.translate(-camX, -camY);
  ctx.textAlign = 'center';

  // sewer manholes
  ctx.font = `${TILE * 0.8}px serif`;
  for (const sw of this.map.sewers) {
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc((sw.tx + 0.5) * TILE, (sw.ty + 0.5) * TILE, TILE * 0.42, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#555'; ctx.stroke();
    ctx.fillStyle = '#777';
    ctx.fillText('〇', (sw.tx + 0.5) * TILE, (sw.ty + 0.82) * TILE);
  }

  // POIs
  for (const poi of this.map.pois) {
    const x = (poi.tx + 0.5) * TILE, y = (poi.ty + 0.5) * TILE;
    const locked = poi.repReq && p.rep < poi.repReq;
    ctx.font = `${TILE * 1.3}px serif`;
    ctx.globalAlpha = locked ? 0.45 : 1;
    ctx.fillText(poi.icon, x, y + TILE * 0.4);
    ctx.globalAlpha = 1;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = locked ? '#888' : poi.kind === 'police' ? '#7da7ff' : poi.kind === 'hideout' ? '#ffd86b' : '#ddd';
    ctx.fillText((locked ? '🔒 ' : '') + poi.name, x, y - TILE * 0.85);
  }

  // checkpoints
  for (const cp of this.police.checkpoints) {
    ctx.fillStyle = 'rgba(255,60,60,0.18)';
    ctx.beginPath(); ctx.arc(cp.x, cp.y, TILE * 2.4, 0, 7); ctx.fill();
    ctx.font = `${TILE}px serif`;
    ctx.fillText('🛑', cp.x, cp.y + TILE * 0.35);
  }

  // cops — drawn big so they visibly own the streets, with their grab radius
  for (const cop of this.police.cops) {
    if (cop.chasing) {
      ctx.fillStyle = 'rgba(255,40,40,0.15)';
      ctx.beginPath(); ctx.arc(cop.x, cop.y, TILE * 1.3, 0, 7); ctx.fill();
    }
    ctx.font = `${TILE * 1.6}px serif`;
    ctx.fillText(cop.stun > 0 ? '😵' : cop.undercover ? '🕵️' : '👮', cop.x, cop.y + TILE * 0.5);
    if (cop.chasing) {
      ctx.fillStyle = '#ff4040';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('!', cop.x, cop.y - TILE * 1.1);
    }
  }

  // player
  const v = this.vehicle();
  ctx.font = `${TILE * 1.05}px serif`;
  ctx.fillText(v.id === 'foot' ? '🧍' : v.icon, p.x, p.y + TILE * 0.35);
  if (this.missions.active) {
    // guide arrow to mission buyer
    const b = this.map.pois.find(x => x.id === this.missions.active.buyerId);
    if (b) {
      const ang = Math.atan2((b.ty + 0.5) * TILE - p.y, (b.tx + 0.5) * TILE - p.x);
      ctx.fillStyle = '#ffd86b';
      ctx.save();
      ctx.translate(p.x + Math.cos(ang) * TILE * 1.4, p.y + Math.sin(ang) * TILE * 1.4);
      ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();

  // night tint
  const phase = p.dayT / DAY_LENGTH;
  if (phase > 0.5) {
    const dark = Math.min(0.45, (phase - 0.5) * 2 * 0.45);
    ctx.fillStyle = `rgba(8,10,30,${dark})`;
    ctx.fillRect(0, 0, cw, ch);
  }

  // interaction prompt
  const near = this.nearestInteractable();
  if (near && !this.panel && !p.jail && !this.bustInfo) {
    const label = near.type === 'sewer' ? `E — Enter ${near.sw.name}` : `E — ${near.poi.name}`;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    const w = ctx.measureText(label).width + 24;
    ctx.fillRect(cw / 2 - w / 2, ch - 110, w, 30);
    ctx.fillStyle = '#ffd86b';
    ctx.fillText(label, cw / 2, ch - 90);
  }

  this.renderMinimap(ctx, cw);

  // jail overlay
  if (p.jail > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('🚔 IN JAIL', cw / 2, ch / 2 - 30);
    ctx.font = '20px sans-serif';
    ctx.fillText(`Release in ${Math.ceil(p.jail)}s`, cw / 2, ch / 2 + 12);
  }

  // death overlay
  if (this.bustInfo) {
    const b = this.bustInfo;
    ctx.fillStyle = 'rgba(20,0,0,0.88)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ff3b3b';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText('☠️ YOU DIED', cw / 2, ch / 2 - 100);
    ctx.fillStyle = '#eee'; ctx.font = '18px sans-serif';
    const lines = [b.reason, '',
      b.lostItems.length ? 'Everything you carried is gone: ' + b.lostItems.join(', ') : 'At least your pockets were already empty.',
      `The street took $${b.fine}   •   Reputation: -${b.repLoss}`,
      'Your stash at the hideout is safe.',
      '', 'Press ENTER to wake up at your hideout.'];
    lines.forEach((l, i) => ctx.fillText(l, cw / 2, ch / 2 - 45 + i * 28));
  }
};

Game.prototype.renderMinimap = function (ctx, cw) {
  const mw = 200, mh = Math.round(mw * MAP_H / MAP_W);
  const x0 = cw - mw - 14, y0 = 64;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.drawImage(this.mapCache, x0, y0, mw, mh);
  ctx.strokeStyle = '#000'; ctx.strokeRect(x0, y0, mw, mh);
  const sx = mw / (MAP_W * TILE), sy = mh / (MAP_H * TILE);
  const dot = (x, y, c, r = 3) => {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x0 + x * sx, y0 + y * sy, r, 0, 7); ctx.fill();
  };
  // POIs
  for (const poi of this.map.pois) {
    const c = poi.kind === 'dealer' ? '#c084fc' : poi.kind === 'buyer' ? '#4ade80' :
      poi.kind === 'hideout' ? '#ffd86b' : poi.kind === 'police' ? '#60a5fa' : '#fb923c';
    dot((poi.tx + 0.5) * TILE, (poi.ty + 0.5) * TILE, c, 2.5);
  }
  // cops, if you have a scanner or scout
  if (this.player.gear.scanner || this.hasWorker('scout')) {
    for (const cop of this.police.cops) dot(cop.x, cop.y, cop.chasing ? '#ff2d2d' : '#3b82f6', 2);
  }
  for (const cp of this.police.checkpoints) dot(cp.x, cp.y, '#ff2d2d', 3.5);
  // mission target
  if (this.missions.active) {
    const b = this.map.pois.find(p => p.id === this.missions.active.buyerId);
    if (b && Math.floor(performance.now() / 400) % 2) dot((b.tx + 0.5) * TILE, (b.ty + 0.5) * TILE, '#fff176', 4);
  }
  dot(this.player.x, this.player.y, '#ffffff', 3.5);
  ctx.restore();
};
