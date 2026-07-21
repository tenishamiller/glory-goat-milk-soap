document.querySelector(".form").addEventListener("submit", (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button");
  const original = btn.textContent;
  btn.textContent = "Sent!";
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
    e.target.reset();
  }, 2200);
});
