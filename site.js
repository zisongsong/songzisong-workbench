"use strict";

const page = document.body.dataset.page;
const params = new URLSearchParams(location.search);

function initializeQuoteSample() {
  const labels = Object.fromEntries([...document.querySelectorAll("[data-sample-field]")].map(node => [node.dataset.sampleField, node]));
  const buttons = [...document.querySelectorAll("[data-sample]")];
  const link = document.querySelector("#quote-link");
  function applySample(index) {
    const sample = window.quotePreview?.(index);
    if (!sample || !link) return;
    for (const key of ["name", "yearly", "setup", "total"]) labels[key].textContent = sample[key];
    labels.years.textContent = sample.years + " 年";
    buttons.forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.sample) === index)));
    link.href = "./quote.html?scene=" + index;
  }
  buttons.forEach(button => button.addEventListener("click", () => applySample(Number(button.dataset.sample))));
}

function mountTool(name, mountToolView) {
  const root = document.getElementById(page + "-app");
  if (!root) return;
  if (typeof window[name] === "function") mountToolView(root, window[name]);
  else root.textContent = "这个工具暂时无法加载。请刷新页面重试。";
}

function mountCaseSections(container) {
  const nav=container.querySelector("[data-case-nav]");
  const panels=[...container.querySelectorAll(":scope > [data-case-panel]")];
  if (!nav || !panels.length) return;
  let active;
  function showSection(moveFocus=false) {
    const id=window.location.hash.slice(1);
    const panel=panels.find(candidate=>candidate.id===id) ?? panels[0];
    if (active===panel) return;
    active=panel;
    panels.forEach(candidate=>{candidate.hidden=candidate!==panel;});
    nav.querySelectorAll("a").forEach(link=>{
      if(link.hash==="#"+panel.id) link.setAttribute("aria-current","page");
      else link.removeAttribute("aria-current");
    });
    if(moveFocus){
      panel.tabIndex=-1;
      panel.focus({preventScroll:true});
      nav.scrollIntoView({block:"start"});
    }
  }
  container.addEventListener("click",event=>{
    const link=event.target.closest('a[href^="#"]');
    if(!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if(!panels.some(panel=>"#"+panel.id===link.hash)) return;
    event.preventDefault();
    if(window.location.hash!==link.hash) window.history.pushState(null,"",link.href);
    showSection(true);
  });
  showSection();
  return showSection;
}

if (page === "home") initializeQuoteSample();
if (page === "quote") mountTool("mountQuote", (root, mount) => {
  mount(root);
  if (!params.has("scene")) return;
  const scene = Number(params.get("scene"));
  if (Number.isInteger(scene) && scene >= 0 && scene <= 2) root.querySelector('[data-quote-preset="' + scene + '"]')?.click();
});
if (page === "cashflow") mountTool("mountCashflow", (root, mount) => mount(root));
if (page === "work") mountTool("mountWork", (root, mount) => mount(root, params.get("case") ?? "studio"));

if (page === "quote" || page === "cashflow") {
  const sync=mountCaseSections(document.querySelector("main"));
  if(sync){
    window.addEventListener("hashchange",()=>sync());
    window.addEventListener("popstate",()=>sync());
  }
}
