// 순위 막대 목록. 단어마다 행 하나를 만들어 두고 순위에 따라 위치만 옮긴다(색은 단어가 아니라 1등 여부를 따른다).
export class RankedBars {
  constructor(el, words, { rows = 8, rowHeight = 44 } = {}) {
    this.el = el;
    this.words = words;
    this.rows = rows;
    this.rowHeight = rowHeight;
    el.classList.add('ranked');
    el.style.height = rows * rowHeight + 'px';
    this.items = words.map((w, i) => {
      const row = document.createElement('div');
      row.className = 'rank-row';
      row.style.height = rowHeight + 'px';
      row.innerHTML = `
        <span class="rank-label"><span class="ko">${w.ko}</span><span class="en">${w.en.replace(/^(a|an|the) /, '')}</span></span>
        <span class="rank-track"><span class="rank-bar"></span></span>
        <span class="rank-value">–</span>`;
      row.style.transform = `translateY(${i * rowHeight}px)`;
      row.style.opacity = i < rows ? '1' : '0';
      el.append(row);
      return { row, bar: row.querySelector('.rank-bar'), value: row.querySelector('.rank-value') };
    });
  }

  // probs: words와 같은 순서의 확률 배열. cosines는 툴팁용.
  update(probs, cosines) {
    const order = probs.map((p, i) => i).sort((a, b) => probs[b] - probs[a]);
    order.forEach((wi, rank) => {
      const it = this.items[wi];
      const visible = rank < this.rows;
      it.row.style.transform = `translateY(${Math.min(rank, this.rows) * this.rowHeight}px)`;
      it.row.style.opacity = visible ? '1' : '0';
      it.row.style.pointerEvents = visible ? '' : 'none';
      it.row.classList.toggle('top', rank === 0);
      it.bar.style.width = (probs[wi] * 100).toFixed(2) + '%';
      it.value.textContent = formatPct(probs[wi]);
      if (cosines) it.row.title = `cosine ${cosines[wi].toFixed(4)}`;
    });
  }

  clear() {
    this.items.forEach((it, i) => {
      it.row.style.transform = `translateY(${Math.min(i, this.rows) * this.rowHeight}px)`;
      it.row.style.opacity = i < this.rows ? '0.35' : '0';
      it.row.classList.remove('top');
      it.bar.style.width = '0%';
      it.value.textContent = '–';
      it.row.title = '';
    });
  }
}

export function formatPct(p) {
  const v = p * 100;
  return (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : '<1') + '%';
}
