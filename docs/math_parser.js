/* Professional Mathematical Expression & LaTeX Parser */
class MathParser {
  static latexToJs(latex) {
    if (!latex || typeof latex !== 'string') return '0';
    let s = latex.trim();

    // Remove derivative prefixes: \dot{x} =, \frac{dx}{dt} =, x' =, dx/dt =
    s = s.replace(/^\\dot\{[a-zA-Z]\}\s*=\s*/, '');
    s = s.replace(/^\\frac\{d[a-zA-Z]\}\{dt\}\s*=\s*/, '');
    s = s.replace(/^[a-zA-Z]'\s*=\s*/, '');
    s = s.replace(/^d[a-zA-Z]\/dt\s*=\s*/, '');

    // Replace fractions: \frac{a}{b} -> ((a)/(b))
    while (s.includes('\\frac')) {
      s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))');
    }

    // Greek symbols to ASCII names
    const greek = {
      '\\alpha': 'alpha', '\\beta': 'beta', '\\gamma': 'gamma', '\\delta': 'delta',
      '\\epsilon': 'eps', '\\eta': 'eta', '\\theta': 'theta', '\\lambda': 'lambda',
      '\\mu': 'mu', '\\sigma': 'sigma', '\\tau': 'tau', '\\omega': 'omega',
      '\\pi': 'Math.PI'
    };
    for (const [tex, name] of Object.entries(greek)) {
      s = s.split(tex).join(name);
    }

    // Convert powers: x^{2} or x^2 -> Math.pow(x, 2)
    s = s.replace(/([a-zA-Z0-9_\)]+)\^\{([^{}]+)\}/g, 'Math.pow($1, $2)');
    s = s.replace(/([a-zA-Z0-9_\)]+)\^([a-zA-Z0-9_]+)/g, 'Math.pow($1, $2)');

    // Standard Math functions
    const funcs = ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs'];
    for (const f of funcs) {
      s = s.split('\\' + f).join('Math.' + f);
    }
    // \ln -> Math.log
    s = s.split('\\ln').join('Math.log');

    // Remove leftover backslashes and LaTeX braces
    s = s.replace(/\\[a-zA-Z]+/g, '');
    s = s.replace(/\{|\}/g, '');

    // Insert explicit multiplication for numbers adjacent to variables or parentheses:
    // e.g. "2x" -> "2*x", "3(" -> "3*("
    s = s.replace(/([0-9])([a-zA-Z\(])/g, '$1*$2');

    // Insert explicit multiplication between closing parenthesis and opening char:
    // e.g. ")x" -> ")*x", ")(" -> ")*("
    s = s.replace(/\)([a-zA-Z0-9\(])/g, ')*$1');

    // Normalize multiple spaces into a single space
    s = s.split(/\s+/).join(' ');

    // Repeatedly replace implicit variable-variable and variable-parenthesis spaces with '*'
    // Use loop to guarantee overlapping matches (e.g. "alpha x y" -> "alpha*x*y")
    while (/([a-zA-Z0-9_\)])\s([a-zA-Z0-9_\(])/.test(s)) {
      s = s.replace(/([a-zA-Z0-9_\)])\s([a-zA-Z0-9_\(])/g, (match, p1, p2) => p1 + '*' + p2);
    }

    // Clean up any double operators like "*+" or "**" that might occur accidentally
    s = s.replace(/\*\+/g, '+');
    s = s.replace(/\*-/g, '-');

    return s;
  }

  static extractParameters(jsExpr) {
    const tokens = jsExpr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    const reserved = new Set([
      'Math', 'PI', 'sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'pow',
      'x', 'y', 't', 'e'
    ]);
    const params = new Set();
    for (const t of tokens) {
      if (!reserved.has(t)) {
        params.add(t);
      }
    }
    return Array.from(params);
  }

  static compile(jsExpr, paramNames) {
    try {
      const destructuring = paramNames.length > 0 ? `const { ${paramNames.join(', ')} } = p;` : '';
      const fn = new Function('x', 'y', 't', 'p', `
        ${destructuring}
        try {
          const res = (${jsExpr});
          return isFinite(res) ? res : 0;
        } catch(e) {
          return 0;
        }
      `);

      // Test execution with unit parameters
      const testP = {};
      paramNames.forEach(name => testP[name] = 1.0);
      const testVal = fn(1.0, 1.0, 0.0, testP);
      if (!isFinite(testVal)) {
        console.warn('Warning: compiled function returned non-finite value on test input:', jsExpr);
      }
      return { fn, error: null };
    } catch (err) {
      console.error('MathParser compilation error for:', jsExpr, err);
      return { fn: null, error: err.message };
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MathParser;
}
