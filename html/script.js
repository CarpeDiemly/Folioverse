const themeButton = document.querySelector('.theme-toggle');
const savedTheme = localStorage.getItem('folioverse-theme');
if (savedTheme === 'dark') document.body.classList.add('dark');
themeButton?.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('folioverse-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});
document.querySelector('#year').textContent = new Date().getFullYear();
