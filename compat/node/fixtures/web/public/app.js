const root = document.querySelector('#root');
if (!root) throw new Error('Missing div#root in index.html.');
root.innerHTML = `
<header class="site-header">
      <a class="brand" href="/" aria-label="Arya Studio home"><span class="brand-mark" aria-hidden="true">a</span> Arya Studio</a>
      <span class="version">1.2 web preview</span>
    </header>
    <main>
      <section class="intro" aria-labelledby="page-title">
        <p class="eyebrow"><span class="status-dot" aria-hidden="true"></span> HTML FIRST. ARYA AT THE CORE.</p>
        <h1 id="page-title">A familiar web.<br><span>A simpler backend.</span></h1>
        <p class="lead">Your page in HTML. Your styles in CSS. Your browser interactions in JavaScript. Your server logic in Arya.</p>
        <div class="file-list" aria-label="Project files"><code>studio.arya</code><code>index.html</code><code>public/styles.css</code><code>public/app.js</code></div>
      </section>
      <section class="workspace" aria-labelledby="calculator-title">
        <div class="workspace-heading"><div><p class="eyebrow">TRY THE CONNECTION</p><h2 id="calculator-title">From browser to Arya</h2></div><span class="route">POST /api/calculate</span></div>
        <form id="calculator">
          <label for="values">Numbers to calculate</label>
          <p id="values-help" class="help">Enter numbers separated by commas.</p>
          <div class="input-row"><input id="values" name="values" value="10, 20, 30" aria-describedby="values-help" required><button id="calculate" type="submit">Calculate <span aria-hidden="true">↗</span></button></div>
        </form>
        <div class="result-heading"><span>SERVER RESPONSE</span><span id="request-status" role="status">Ready</span></div>
        <pre id="result" tabindex="0" aria-label="Calculation result">Your calculation will appear here.</pre>
      </section>
      <section class="details" aria-label="How this project works">
        <article><span class="step">01</span><h3>Standard web files</h3><p>The server requires <code>index.html</code> by default and serves browser assets from <code>public/</code>.</p></article>
        <article><span class="step">02</span><h3>Arya routes</h3><p>The form sends JSON to an Arya function. The server validates the numbers and returns their count, total, and average.</p></article>
        <article><span class="step">03</span><h3>Connected ecosystems</h3><p><a href="/api/python">Try Python statistics <span aria-hidden="true">↗</span></a> through the same server. This optional endpoint needs Python installed.</p></article>
      </section>
    </main>
    <footer>Built with Arya · Runs locally on the JavaScript target</footer>
`;

const form = root.querySelector('#calculator');
const button = root.querySelector('#calculate');
const input = root.querySelector('#values');
const output = root.querySelector('#result');
const status = root.querySelector('#request-status');

form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  status.dataset.state = 'loading';
  status.textContent = 'Calculating…';
  try {
    const parts = input.value.split(',').map(value => value.trim());
    if (parts.some(value => value === '')) throw new Error('Enter numbers separated by commas.');
    const values = parts.map(Number);
    if (!values.every(Number.isFinite)) throw new Error('Every value must be a finite number.');
    const response = await fetch('/api/calculate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({values})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The calculation failed.');
    output.textContent = JSON.stringify(result, null, 2);
    status.dataset.state = 'success';
    status.textContent = 'Complete';
  } catch (error) {
    output.textContent = error.message;
    status.dataset.state = 'error';
    status.textContent = 'Check your request';
  } finally {
    button.disabled = false;
  }
});
