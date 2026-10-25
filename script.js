/* ==========================================================
   Calculadora Carbono - Lógica
   Partes del archivo:
   1. Motor matemático (analiza y evalúa la expresión)
   2. Estado y entrada de teclas
   3. Historial
   4. Pantalla (render)
   5. Eventos (ratón y teclado)
   ========================================================== */

(() => {
  'use strict';

  /* ==========================================================
     1. MOTOR MATEMÁTICO
     No se usa eval(): la expresión se separa en tokens y se
     resuelve con un analizador recursivo que respeta la
     jerarquía de operaciones.
     ========================================================== */

  class ErrorCalc extends Error {}

  const INVALIDA = 'Expresión inválida';
  const DOMINIO = 'Operación no válida';

  // Símbolos que acepta el analizador y su forma normalizada
  const OPERADOR = {
    '+': '+', '-': '-', '−': '-',
    '×': '*', '*': '*',
    '÷': '/', '/': '/',
    '^': '^', '%': '%', '!': '!'
  };

  // Convierte el texto en una lista de tokens
  function tokenizar(texto) {
    const tokens = [];
    let i = 0;

    while (i < texto.length) {
      const resto = texto.slice(i);
      const c = resto[0];
      let m;

      if ((m = resto.match(/^(?:\d+\.?\d*|\.\d+)(?:E[+\-−]?\d+)?/))) {
        tokens.push({ t: 'num', v: parseFloat(m[0].replace('−', '-')) });
        i += m[0].length;
      } else if ((m = resto.match(/^(sin|cos|tan|log|ln|abs)/))) {
        tokens.push({ t: 'fn', v: m[1] });
        i += m[1].length;
      } else if (c === '√') {
        tokens.push({ t: 'fn', v: '√' });
        i++;
      } else if (c === 'π' || c === 'e') {
        tokens.push({ t: 'const', v: c });
        i++;
      } else if (OPERADOR[c]) {
        tokens.push({ t: 'op', v: OPERADOR[c] });
        i++;
      } else if (c === '(' || c === ')') {
        tokens.push({ t: 'par', v: c });
        i++;
      } else {
        throw new ErrorCalc(INVALIDA);
      }
    }
    return tokens;
  }

  function aRadianes(x, grados) {
    return grados ? (x * Math.PI) / 180 : x;
  }

  // Evita resultados como 1.2e-16 en lugar de 0
  function limpiarCero(r) {
    return Math.abs(r) < 1e-12 ? 0 : r;
  }

  function factorial(n) {
    if (!Number.isInteger(n) || n < 0 || n > 170) throw new ErrorCalc(DOMINIO);
    let r = 1;
    for (let k = 2; k <= n; k++) r *= k;
    return r;
  }

  function aplicarFuncion(nombre, x, grados) {
    switch (nombre) {
      case 'sin':
        return limpiarCero(Math.sin(aRadianes(x, grados)));
      case 'cos':
        return limpiarCero(Math.cos(aRadianes(x, grados)));
      case 'tan': {
        const r = aRadianes(x, grados);
        if (Math.abs(Math.cos(r)) < 1e-12) throw new ErrorCalc('Valor indefinido');
        return limpiarCero(Math.tan(r));
      }
      case 'log':
        if (x <= 0) throw new ErrorCalc(DOMINIO);
        return Math.log10(x);
      case 'ln':
        if (x <= 0) throw new ErrorCalc(DOMINIO);
        return Math.log(x);
      case '√':
        if (x < 0) throw new ErrorCalc(DOMINIO);
        return Math.sqrt(x);
      case 'abs':
        return Math.abs(x);
      default:
        throw new ErrorCalc(INVALIDA);
    }
  }

  /*
    Gramática que sigue el analizador (de menor a mayor prioridad):
      expresion = termino { (+ | -) termino }
      termino   = unario { (* | /) unario }      (también multiplicación implícita: 2π, 3(4+1))
      unario    = [+ | -] unario | potencia
      potencia  = postfijo [ ^ unario ]
      postfijo  = primario { % | ! }
      primario  = número | constante | ( expresion ) | función ( expresion )
  */
  function evaluar(texto, grados) {
    const tokens = tokenizar(texto);
    let pos = 0;

    const ver = () => tokens[pos];
    const esOp = (t, ...ops) => Boolean(t) && t.t === 'op' && ops.includes(t.v);
    const empiezaFactor = (t) =>
      Boolean(t) && (t.t === 'num' || t.t === 'fn' || t.t === 'const' || (t.t === 'par' && t.v === '('));

    function cerrarParentesis() {
      const t = tokens[pos++];
      if (!t || t.t !== 'par' || t.v !== ')') throw new ErrorCalc(INVALIDA);
    }

    function expresion() {
      let valor = termino();
      while (esOp(ver(), '+', '-')) {
        const op = tokens[pos++].v;
        const der = termino();
        valor = op === '+' ? valor + der : valor - der;
      }
      return valor;
    }

    function termino() {
      let valor = unario();
      for (;;) {
        const t = ver();
        if (esOp(t, '*', '/')) {
          pos++;
          const der = unario();
          if (t.v === '/') {
            if (der === 0) throw new ErrorCalc('No se puede dividir por cero');
            valor /= der;
          } else {
            valor *= der;
          }
        } else if (empiezaFactor(t)) {
          valor *= potencia(); // multiplicación implícita
        } else {
          break;
        }
      }
      return valor;
    }

    function unario() {
      const t = ver();
      if (esOp(t, '-')) { pos++; return -unario(); }
      if (esOp(t, '+')) { pos++; return unario(); }
      return potencia();
    }

    function potencia() {
      const base = postfijo();
      if (esOp(ver(), '^')) {
        pos++;
        const exponente = unario(); // la potencia se asocia por la derecha
        const r = Math.pow(base, exponente);
        if (!Number.isFinite(r)) throw new ErrorCalc(DOMINIO);
        return r;
      }
      return base;
    }

    function postfijo() {
      let valor = primario();
      for (;;) {
        const t = ver();
        if (esOp(t, '%')) { pos++; valor /= 100; }
        else if (esOp(t, '!')) { pos++; valor = factorial(valor); }
        else break;
      }
      return valor;
    }

    function primario() {
      const t = tokens[pos++];
      if (!t) throw new ErrorCalc(INVALIDA);

      if (t.t === 'num') return t.v;
      if (t.t === 'const') return t.v === 'π' ? Math.PI : Math.E;

      if (t.t === 'par' && t.v === '(') {
        const valor = expresion();
        cerrarParentesis();
        return valor;
      }

      if (t.t === 'fn') {
        const abre = tokens[pos++];
        if (!abre || abre.t !== 'par' || abre.v !== '(') throw new ErrorCalc(INVALIDA);
        const argumento = expresion();
        cerrarParentesis();
        return aplicarFuncion(t.v, argumento, grados);
      }

      throw new ErrorCalc(INVALIDA);
    }

    const resultado = expresion();
    if (pos < tokens.length) throw new ErrorCalc(INVALIDA); // sobraron símbolos
    if (!Number.isFinite(resultado)) throw new ErrorCalc(DOMINIO);
    return resultado;
  }

  // Quita operadores sueltos al final y cierra los paréntesis que falten
  function preparar(texto) {
    const t = texto.replace(/[+−×÷^]+$/, '');
    const abiertos = (t.match(/\(/g) || []).length;
    const cerrados = (t.match(/\)/g) || []).length;
    return t + ')'.repeat(Math.max(0, abiertos - cerrados));
  }

  // Redondea a 12 cifras significativas y usa notación científica si hace falta
  function formatearNumero(n) {
    if (n === 0) return '0';
    const abs = Math.abs(n);
    let s;
    if (abs >= 1e15 || abs < 1e-6) {
      s = n.toExponential(8).replace(/\.?0+e/, 'e').replace('e', 'E');
    } else {
      s = String(parseFloat(n.toPrecision(12)));
    }
    return s.replace('-', '−');
  }

  /* ==========================================================
     2. ESTADO Y ENTRADA DE TECLAS
     ========================================================== */

  const estado = {
    expr: '',          // texto que escribe el usuario
    exprPrevia: '',    // expresión que dio el último resultado
    evaluado: false,   // true justo después de pulsar "="
    error: '',
    grados: true,      // true = grados, false = radianes
    historial: []
  };

  const TERMINA_EN_VALOR = /[\dπe)%!]$/;

  const calc = document.getElementById('calc');
  const pantalla = document.getElementById('pantalla');
  const previa = document.getElementById('previa');
  const panelCientifico = document.getElementById('cientifica');
  const btnAngulo = document.getElementById('btn-angulo');
  const panelHistorial = document.getElementById('historial');
  const listaHistorial = document.getElementById('lista-historial');
  const historialVacio = document.getElementById('historial-vacio');
  const btnHistorial = document.getElementById('btn-historial');
  const aviso = document.getElementById('aviso');

  function ultimoNumero() {
    return estado.expr.match(/\d*\.?\d*$/)[0];
  }

  // Si acaba de mostrarse un resultado y se escribe algo nuevo, se empieza de cero
  function iniciarSiEvaluado() {
    if (estado.evaluado) {
      estado.expr = '';
      estado.evaluado = false;
    }
  }

  function ingresarDigito(d) {
    iniciarSiEvaluado();
    const num = ultimoNumero();
    if (num === '' && TERMINA_EN_VALOR.test(estado.expr)) estado.expr += '×';
    if (num === '0') {
      estado.expr = estado.expr.slice(0, -1) + d; // evita ceros a la izquierda
    } else {
      estado.expr += d;
    }
  }

  function ingresarPunto() {
    iniciarSiEvaluado();
    const num = ultimoNumero();
    if (num.includes('.')) return;
    if (num === '') {
      if (TERMINA_EN_VALOR.test(estado.expr)) estado.expr += '×';
      estado.expr += '0.';
    } else {
      estado.expr += '.';
    }
  }

  function ingresarOperador(op) {
    estado.evaluado = false;
    const e = estado.expr;

    if (e === '') {
      if (op === '−') estado.expr = '−'; // permite empezar con número negativo
      return;
    }

    const ultimo = e.slice(-1);

    if ('+−×÷^'.includes(ultimo)) {
      const anterior = e.slice(-2, -1);
      if (anterior === '' || anterior === '(') return;  // es un signo negativo, no se cambia
      if (op === '−' && '×÷^'.includes(ultimo)) {       // 2×−3 o 2^−3: el − es un signo
        estado.expr += '−';
        return;
      }
      if (ultimo === '−' && '×÷^'.includes(anterior)) { // había un signo: se cambia todo el par
        estado.expr = e.slice(0, -2) + op;
        return;
      }
      estado.expr = e.slice(0, -1) + op;                // reemplaza el operador anterior
      return;
    }

    if (ultimo === '(') {
      if (op === '−') estado.expr += '−';
      return;
    }

    estado.expr += op;
  }

  function ingresarFuncion(nombre) {
    iniciarSiEvaluado();
    estado.expr += nombre + '(';
  }

  function ingresarConstante(c) {
    iniciarSiEvaluado();
    estado.expr += c;
  }

  function ingresarParentesis(p) {
    if (p === '(') {
      iniciarSiEvaluado();
      estado.expr += '(';
      return;
    }
    const abiertos = (estado.expr.match(/\(/g) || []).length;
    const cerrados = (estado.expr.match(/\)/g) || []).length;
    if (abiertos > cerrados && TERMINA_EN_VALOR.test(estado.expr)) {
      estado.evaluado = false;
      estado.expr += ')';
    }
  }

  // %, !, x² y x⁻¹ se escriben después de un valor
  function ingresarSufijo(texto) {
    if (!TERMINA_EN_VALOR.test(estado.expr)) return;
    estado.evaluado = false;
    estado.expr += texto;
  }

  // Cambia el signo del último número: 5 -> (−5) -> 5
  function cambiarSigno() {
    const e = estado.expr;
    if (/\(−\d+\.?\d*\)$/.test(e)) {
      estado.expr = e.replace(/\(−(\d+\.?\d*)\)$/, '$1');
    } else if (/\d+\.?\d*$/.test(e)) {
      estado.expr = e.replace(/(\d+\.?\d*)$/, '(−$1)');
    }
    estado.evaluado = false;
  }

  function borrarUltimo() {
    estado.evaluado = false;
    if (/(sin|cos|tan|log|ln|abs)\($/.test(estado.expr)) {
      estado.expr = estado.expr.replace(/(sin|cos|tan|log|ln|abs)\($/, '');
    } else {
      estado.expr = estado.expr.slice(0, -1);
    }
  }

  function limpiarTodo() {
    estado.expr = '';
    estado.exprPrevia = '';
    estado.evaluado = false;
    estado.error = '';
  }

  function calcularIgual() {
    if (!estado.expr || estado.evaluado) return;
    const preparada = preparar(estado.expr);
    try {
      const resultado = formatearNumero(evaluar(preparada, estado.grados));
      if (resultado !== preparada) guardarEnHistorial(preparada, resultado);
      estado.exprPrevia = preparada;
      estado.expr = resultado;
      estado.evaluado = true;
    } catch (err) {
      estado.error = err instanceof ErrorCalc ? err.message : 'Error';
    }
  }

  // Punto de entrada único para todas las teclas (ratón o teclado)
  function ejecutar(accion, valor) {
    if (estado.error) {
      limpiarTodo();
      if (accion === 'limpiar' || accion === 'borrar' || accion === 'igual') {
        render();
        return;
      }
    }

    switch (accion) {
      case 'digito':     ingresarDigito(valor); break;
      case 'punto':      ingresarPunto(); break;
      case 'operador':   ingresarOperador(valor); break;
      case 'funcion':    ingresarFuncion(valor); break;
      case 'constante':  ingresarConstante(valor); break;
      case 'parentesis': ingresarParentesis(valor); break;
      case 'sufijo':     ingresarSufijo(valor); break;
      case 'signo':      cambiarSigno(); break;
      case 'borrar':     borrarUltimo(); break;
      case 'limpiar':    limpiarTodo(); break;
      case 'igual':      calcularIgual(); break;
      case 'angulo':     estado.grados = !estado.grados; break;
    }
    render();
  }

  /* ==========================================================
     3. HISTORIAL
     ========================================================== */

  const CLAVE_HISTORIAL = 'calculadora-carbono-historial';
  const MAX_HISTORIAL = 30;

  function cargarHistorial() {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE_HISTORIAL));
      if (Array.isArray(guardado)) {
        estado.historial = guardado
          .filter((x) => x && typeof x.expr === 'string' && typeof x.resultado === 'string')
          .slice(0, MAX_HISTORIAL);
      }
    } catch (err) {
      estado.historial = [];
    }
  }

  function persistirHistorial() {
    try {
      localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(estado.historial));
    } catch (err) {
      /* si el navegador no permite guardar, el historial dura solo la sesión */
    }
  }

  function guardarEnHistorial(expr, resultado) {
    estado.historial.unshift({ expr, resultado });
    estado.historial = estado.historial.slice(0, MAX_HISTORIAL);
    persistirHistorial();
    renderHistorial();
  }

  function renderHistorial() {
    listaHistorial.textContent = '';
    historialVacio.hidden = estado.historial.length > 0;

    estado.historial.forEach((item) => {
      const li = document.createElement('li');
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'historial__item';

      const e = document.createElement('span');
      e.className = 'historial__expr';
      e.textContent = item.expr;

      const r = document.createElement('span');
      r.className = 'historial__res';
      r.textContent = '= ' + item.resultado;

      boton.append(e, r);
      boton.addEventListener('click', () => {
        // Al tocar una operación se vuelve a usar su resultado
        limpiarTodo();
        estado.expr = item.resultado;
        render();
        alternarHistorial(false);
      });

      li.appendChild(boton);
      listaHistorial.appendChild(li);
    });
  }

  function alternarHistorial(abrir) {
    panelHistorial.classList.toggle('abierto', abrir);
    panelHistorial.inert = !abrir;
    btnHistorial.setAttribute('aria-expanded', String(abrir));
    if (abrir) {
      panelHistorial.querySelector('button').focus();
    } else {
      btnHistorial.focus();
    }
  }

  /* ==========================================================
     4. PANTALLA
     ========================================================== */

  function calcularPrevia() {
    if (estado.evaluado || !estado.expr) return '';
    const preparada = preparar(estado.expr);
    if (/^−?\d*\.?\d*$/.test(preparada)) return ''; // solo hay un número, no hay nada que adelantar
    try {
      return '= ' + formatearNumero(evaluar(preparada, estado.grados));
    } catch (err) {
      return '';
    }
  }

  function render() {
    const texto = estado.error || estado.expr || '0';
    pantalla.textContent = texto;
    pantalla.classList.toggle('es-error', Boolean(estado.error));

    // El tamaño de la letra baja a medida que el texto crece
    const largo = texto.length;
    pantalla.dataset.tam = largo >= 16 ? 'xs' : largo >= 12 ? 's' : largo >= 9 ? 'm' : 'l';
    pantalla.scrollLeft = pantalla.scrollWidth;

    if (estado.error) {
      previa.textContent = '';
    } else if (estado.evaluado) {
      previa.textContent = estado.exprPrevia + ' =';
    } else {
      previa.textContent = calcularPrevia();
    }

    btnAngulo.textContent = estado.grados ? 'DEG' : 'RAD';
  }

  let temporizadorAviso;
  function mostrarAviso(mensaje) {
    aviso.textContent = mensaje;
    aviso.classList.add('visible');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), 1600);
  }

  function cambiarModo(modo) {
    calc.dataset.modo = modo;
    panelCientifico.inert = modo !== 'cientifica';
    document.querySelectorAll('.modo').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.modo === modo));
    });
  }

  /* ==========================================================
     5. EVENTOS
     ========================================================== */

  // Teclas en pantalla (un solo listener para todos los botones)
  calc.addEventListener('click', (ev) => {
    const boton = ev.target.closest('button[data-accion]');
    if (boton) ejecutar(boton.dataset.accion, boton.dataset.valor);
  });

  document.querySelectorAll('.modo').forEach((b) => {
    b.addEventListener('click', () => cambiarModo(b.dataset.modo));
  });

  btnHistorial.addEventListener('click', () => alternarHistorial(true));
  document.getElementById('btn-cerrar-historial').addEventListener('click', () => alternarHistorial(false));
  document.getElementById('btn-borrar-historial').addEventListener('click', () => {
    estado.historial = [];
    persistirHistorial();
    renderHistorial();
  });

  // Clic en la pantalla: copia el resultado
  pantalla.addEventListener('click', async () => {
    if (!estado.evaluado) return;
    try {
      await navigator.clipboard.writeText(estado.expr.replace('−', '-'));
      mostrarAviso('Resultado copiado');
    } catch (err) {
      mostrarAviso('No se pudo copiar');
    }
  });

  // Teclado físico
  function teclaAAccion(k) {
    if (/^\d$/.test(k)) return ['digito', k];
    switch (k) {
      case '.':
      case ',': return ['punto'];
      case '+': return ['operador', '+'];
      case '-': return ['operador', '−'];
      case '*':
      case 'x':
      case 'X': return ['operador', '×'];
      case '/': return ['operador', '÷'];
      case '^': return ['operador', '^'];
      case '(': return ['parentesis', '('];
      case ')': return ['parentesis', ')'];
      case '%': return ['sufijo', '%'];
      case '!': return ['sufijo', '!'];
      case 'Enter':
      case '=': return ['igual'];
      case 'Backspace': return ['borrar'];
      case 'Escape':
      case 'Delete': return ['limpiar'];
      default: return null;
    }
  }

  // Efecto visual en la tecla de pantalla cuando se usa el teclado físico
  function destacarTecla(accion, valor) {
    let selector = `button[data-accion="${accion}"]`;
    if (valor !== undefined) selector += `[data-valor="${valor}"]`;
    const boton = calc.querySelector(selector);
    if (!boton) return;
    boton.classList.add('activa');
    setTimeout(() => boton.classList.remove('activa'), 120);
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    if (ev.key === 'Escape' && panelHistorial.classList.contains('abierto')) {
      alternarHistorial(false);
      return;
    }

    const par = teclaAAccion(ev.key);
    if (!par) return;

    ev.preventDefault();
    ejecutar(par[0], par[1]);
    destacarTecla(par[0], par[1]);
  });

  /* ---------- Inicio ---------- */
  cargarHistorial();
  renderHistorial();
  render();
})();
