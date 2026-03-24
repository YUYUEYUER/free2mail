export function icon(name, classes = '') {
  const className = classes ? `ui-icon ${classes}` : 'ui-icon';
  return `<svg class="${className}" aria-hidden="true"><use href="/icons.svg#${name}"></use></svg>`;
}

export function setIcon(element, name, classes = '') {
  if (!element) return;
  element.innerHTML = icon(name, classes);
}

export function buttonIcon(name, label, classes = '') {
  return `${icon(name, classes)}<span>${label}</span>`;
}

export default {
  icon,
  setIcon,
  buttonIcon,
};
