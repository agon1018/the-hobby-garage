export function initPagedSection(sectionSelector: string, itemSelector: string) {
  document.querySelectorAll<HTMLElement>(sectionSelector).forEach((section) => {
    if (section.dataset.bound === 'true') return;
    section.dataset.bound = 'true';
    updatePagedSection(section, itemSelector);

    section.querySelector('[data-more]')?.addEventListener('click', () => {
      const pageSize = Number(section.dataset.pageSize || 10);
      revealPagedItems(section, itemSelector, pageSize);
    });

    section.querySelector('[data-all]')?.addEventListener('click', () => {
      revealPagedItems(section, itemSelector, Number.POSITIVE_INFINITY);
    });

    section.querySelector('[data-reset]')?.addEventListener('click', () => {
      resetPagedSection(section, itemSelector);
    });
  });
}

function getPagedItems(section: HTMLElement, itemSelector: string): HTMLElement[] {
  return [...section.querySelectorAll<HTMLElement>(itemSelector)];
}

function updatePagedSection(section: HTMLElement, itemSelector: string) {
  const pageSize = Number(section.dataset.pageSize || 10);
  const items = getPagedItems(section, itemSelector);
  const shownLabel = section.querySelector('[data-shown]');
  const moreButton = section.querySelector<HTMLButtonElement>('[data-more]');
  const allButton = section.querySelector<HTMLButtonElement>('[data-all]');
  const resetButton = section.querySelector<HTMLButtonElement>('[data-reset]');
  const visibleCount = items.filter((item) => !item.hidden).length;
  const remaining = items.length - visibleCount;

  if (shownLabel) shownLabel.textContent = String(visibleCount);

  if (moreButton) {
    moreButton.hidden = remaining === 0;
    const next = Math.min(pageSize, remaining);
    moreButton.textContent = remaining > pageSize ? `もっと見る（${pageSize}件）` : `もっと見る（残り${next}件）`;
  }

  if (allButton) allButton.hidden = remaining === 0;
  if (resetButton) resetButton.hidden = visibleCount <= pageSize;
}

function revealPagedItems(section: HTMLElement, itemSelector: string, count: number) {
  const hiddenItems = getPagedItems(section, itemSelector).filter((item) => item.hidden);
  const nextItems = hiddenItems.slice(0, count);
  nextItems.forEach((item) => {
    item.hidden = false;
  });
  nextItems[0]?.focus();
  updatePagedSection(section, itemSelector);
}

function resetPagedSection(section: HTMLElement, itemSelector: string) {
  const pageSize = Number(section.dataset.pageSize || 10);
  getPagedItems(section, itemSelector).forEach((item, index) => {
    item.hidden = index >= pageSize;
  });
  updatePagedSection(section, itemSelector);
  section.querySelector('h2')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
