(() => {
  'use strict';
  var e = {};
  function t(e) {
    return (
      (t =
        'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
          ? function (e) {
              return typeof e;
            }
          : function (e) {
              return e &&
                'function' == typeof Symbol &&
                e.constructor === Symbol &&
                e !== Symbol.prototype
                ? 'symbol'
                : typeof e;
            }),
      t(e)
    );
  }
  function r() {
    r = function () {
      return n;
    };
    var e,
      n = {},
      o = Object.prototype,
      a = o.hasOwnProperty,
      i =
        Object.defineProperty ||
        function (e, t, r) {
          e[t] = r.value;
        },
      c = 'function' == typeof Symbol ? Symbol : {},
      s = c.iterator || '@@iterator',
      u = c.asyncIterator || '@@asyncIterator',
      l = c.toStringTag || '@@toStringTag';
    function p(e, t, r) {
      return (
        Object.defineProperty(e, t, {
          value: r,
          enumerable: !0,
          configurable: !0,
          writable: !0,
        }),
        e[t]
      );
    }
    try {
      p({}, '');
    } catch (e) {
      p = function (e, t, r) {
        return (e[t] = r);
      };
    }
    function f(e, t, r, n) {
      var o = t && t.prototype instanceof g ? t : g,
        a = Object.create(o.prototype),
        c = new N(n || []);
      return i(a, '_invoke', { value: j(e, r, c) }), a;
    }
    function h(e, t, r) {
      try {
        return { type: 'normal', arg: e.call(t, r) };
      } catch (e) {
        return { type: 'throw', arg: e };
      }
    }
    n.wrap = f;
    var d = 'suspendedStart',
      m = 'suspendedYield',
      v = 'executing',
      y = 'completed',
      b = {};
    function g() {}
    function x() {}
    function w() {}
    var k = {};
    p(k, s, function () {
      return this;
    });
    var E = Object.getPrototypeOf,
      L = E && E(E(T([])));
    L && L !== o && a.call(L, s) && (k = L);
    var I = (w.prototype = g.prototype = Object.create(k));
    function S(e) {
      ['next', 'throw', 'return'].forEach(function (t) {
        p(e, t, function (e) {
          return this._invoke(t, e);
        });
      });
    }
    function O(e, r) {
      function n(o, i, c, s) {
        var u = h(e[o], e, i);
        if ('throw' !== u.type) {
          var l = u.arg,
            p = l.value;
          return p && 'object' == t(p) && a.call(p, '__await')
            ? r.resolve(p.__await).then(
                function (e) {
                  n('next', e, c, s);
                },
                function (e) {
                  n('throw', e, c, s);
                }
              )
            : r.resolve(p).then(
                function (e) {
                  (l.value = e), c(l);
                },
                function (e) {
                  return n('throw', e, c, s);
                }
              );
        }
        s(u.arg);
      }
      var o;
      i(this, '_invoke', {
        value: function (e, t) {
          function a() {
            return new r(function (r, o) {
              n(e, t, r, o);
            });
          }
          return (o = o ? o.then(a, a) : a());
        },
      });
    }
    function j(t, r, n) {
      var o = d;
      return function (a, i) {
        if (o === v) throw Error('Generator is already running');
        if (o === y) {
          if ('throw' === a) throw i;
          return { value: e, done: !0 };
        }
        for (n.method = a, n.arg = i; ; ) {
          var c = n.delegate;
          if (c) {
            var s = _(c, n);
            if (s) {
              if (s === b) continue;
              return s;
            }
          }
          if ('next' === n.method) n.sent = n._sent = n.arg;
          else if ('throw' === n.method) {
            if (o === d) throw ((o = y), n.arg);
            n.dispatchException(n.arg);
          } else 'return' === n.method && n.abrupt('return', n.arg);
          o = v;
          var u = h(t, r, n);
          if ('normal' === u.type) {
            if (((o = n.done ? y : m), u.arg === b)) continue;
            return { value: u.arg, done: n.done };
          }
          'throw' === u.type &&
            ((o = y), (n.method = 'throw'), (n.arg = u.arg));
        }
      };
    }
    function _(t, r) {
      var n = r.method,
        o = t.iterator[n];
      if (o === e)
        return (
          (r.delegate = null),
          ('throw' === n &&
            t.iterator.return &&
            ((r.method = 'return'),
            (r.arg = e),
            _(t, r),
            'throw' === r.method)) ||
            ('return' !== n &&
              ((r.method = 'throw'),
              (r.arg = new TypeError(
                "The iterator does not provide a '" + n + "' method"
              )))),
          b
        );
      var a = h(o, t.iterator, r.arg);
      if ('throw' === a.type)
        return (r.method = 'throw'), (r.arg = a.arg), (r.delegate = null), b;
      var i = a.arg;
      return i
        ? i.done
          ? ((r[t.resultName] = i.value),
            (r.next = t.nextLoc),
            'return' !== r.method && ((r.method = 'next'), (r.arg = e)),
            (r.delegate = null),
            b)
          : i
        : ((r.method = 'throw'),
          (r.arg = new TypeError('iterator result is not an object')),
          (r.delegate = null),
          b);
    }
    function P(e) {
      var t = { tryLoc: e[0] };
      1 in e && (t.catchLoc = e[1]),
        2 in e && ((t.finallyLoc = e[2]), (t.afterLoc = e[3])),
        this.tryEntries.push(t);
    }
    function C(e) {
      var t = e.completion || {};
      (t.type = 'normal'), delete t.arg, (e.completion = t);
    }
    function N(e) {
      (this.tryEntries = [{ tryLoc: 'root' }]),
        e.forEach(P, this),
        this.reset(!0);
    }
    function T(r) {
      if (r || '' === r) {
        var n = r[s];
        if (n) return n.call(r);
        if ('function' == typeof r.next) return r;
        if (!isNaN(r.length)) {
          var o = -1,
            i = function t() {
              for (; ++o < r.length; )
                if (a.call(r, o)) return (t.value = r[o]), (t.done = !1), t;
              return (t.value = e), (t.done = !0), t;
            };
          return (i.next = i);
        }
      }
      throw new TypeError(t(r) + ' is not iterable');
    }
    return (
      (x.prototype = w),
      i(I, 'constructor', { value: w, configurable: !0 }),
      i(w, 'constructor', { value: x, configurable: !0 }),
      (x.displayName = p(w, l, 'GeneratorFunction')),
      (n.isGeneratorFunction = function (e) {
        var t = 'function' == typeof e && e.constructor;
        return (
          !!t && (t === x || 'GeneratorFunction' === (t.displayName || t.name))
        );
      }),
      (n.mark = function (e) {
        return (
          Object.setPrototypeOf
            ? Object.setPrototypeOf(e, w)
            : ((e.__proto__ = w), p(e, l, 'GeneratorFunction')),
          (e.prototype = Object.create(I)),
          e
        );
      }),
      (n.awrap = function (e) {
        return { __await: e };
      }),
      S(O.prototype),
      p(O.prototype, u, function () {
        return this;
      }),
      (n.AsyncIterator = O),
      (n.async = function (e, t, r, o, a) {
        void 0 === a && (a = Promise);
        var i = new O(f(e, t, r, o), a);
        return n.isGeneratorFunction(t)
          ? i
          : i.next().then(function (e) {
              return e.done ? e.value : i.next();
            });
      }),
      S(I),
      p(I, l, 'Generator'),
      p(I, s, function () {
        return this;
      }),
      p(I, 'toString', function () {
        return '[object Generator]';
      }),
      (n.keys = function (e) {
        var t = Object(e),
          r = [];
        for (var n in t) r.push(n);
        return (
          r.reverse(),
          function e() {
            for (; r.length; ) {
              var n = r.pop();
              if (n in t) return (e.value = n), (e.done = !1), e;
            }
            return (e.done = !0), e;
          }
        );
      }),
      (n.values = T),
      (N.prototype = {
        constructor: N,
        reset: function (t) {
          if (
            ((this.prev = 0),
            (this.next = 0),
            (this.sent = this._sent = e),
            (this.done = !1),
            (this.delegate = null),
            (this.method = 'next'),
            (this.arg = e),
            this.tryEntries.forEach(C),
            !t)
          )
            for (var r in this)
              't' === r.charAt(0) &&
                a.call(this, r) &&
                !isNaN(+r.slice(1)) &&
                (this[r] = e);
        },
        stop: function () {
          this.done = !0;
          var e = this.tryEntries[0].completion;
          if ('throw' === e.type) throw e.arg;
          return this.rval;
        },
        dispatchException: function (t) {
          if (this.done) throw t;
          var r = this;
          function n(n, o) {
            return (
              (c.type = 'throw'),
              (c.arg = t),
              (r.next = n),
              o && ((r.method = 'next'), (r.arg = e)),
              !!o
            );
          }
          for (var o = this.tryEntries.length - 1; o >= 0; --o) {
            var i = this.tryEntries[o],
              c = i.completion;
            if ('root' === i.tryLoc) return n('end');
            if (i.tryLoc <= this.prev) {
              var s = a.call(i, 'catchLoc'),
                u = a.call(i, 'finallyLoc');
              if (s && u) {
                if (this.prev < i.catchLoc) return n(i.catchLoc, !0);
                if (this.prev < i.finallyLoc) return n(i.finallyLoc);
              } else if (s) {
                if (this.prev < i.catchLoc) return n(i.catchLoc, !0);
              } else {
                if (!u) throw Error('try statement without catch or finally');
                if (this.prev < i.finallyLoc) return n(i.finallyLoc);
              }
            }
          }
        },
        abrupt: function (e, t) {
          for (var r = this.tryEntries.length - 1; r >= 0; --r) {
            var n = this.tryEntries[r];
            if (
              n.tryLoc <= this.prev &&
              a.call(n, 'finallyLoc') &&
              this.prev < n.finallyLoc
            ) {
              var o = n;
              break;
            }
          }
          o &&
            ('break' === e || 'continue' === e) &&
            o.tryLoc <= t &&
            t <= o.finallyLoc &&
            (o = null);
          var i = o ? o.completion : {};
          return (
            (i.type = e),
            (i.arg = t),
            o
              ? ((this.method = 'next'), (this.next = o.finallyLoc), b)
              : this.complete(i)
          );
        },
        complete: function (e, t) {
          if ('throw' === e.type) throw e.arg;
          return (
            'break' === e.type || 'continue' === e.type
              ? (this.next = e.arg)
              : 'return' === e.type
                ? ((this.rval = this.arg = e.arg),
                  (this.method = 'return'),
                  (this.next = 'end'))
                : 'normal' === e.type && t && (this.next = t),
            b
          );
        },
        finish: function (e) {
          for (var t = this.tryEntries.length - 1; t >= 0; --t) {
            var r = this.tryEntries[t];
            if (r.finallyLoc === e)
              return this.complete(r.completion, r.afterLoc), C(r), b;
          }
        },
        catch: function (e) {
          for (var t = this.tryEntries.length - 1; t >= 0; --t) {
            var r = this.tryEntries[t];
            if (r.tryLoc === e) {
              var n = r.completion;
              if ('throw' === n.type) {
                var o = n.arg;
                C(r);
              }
              return o;
            }
          }
          throw Error('illegal catch attempt');
        },
        delegateYield: function (t, r, n) {
          return (
            (this.delegate = { iterator: T(t), resultName: r, nextLoc: n }),
            'next' === this.method && (this.arg = e),
            b
          );
        },
      }),
      n
    );
  }
  function n(e, t, r, n, o, a, i) {
    try {
      var c = e[a](i),
        s = c.value;
    } catch (e) {
      return void r(e);
    }
    c.done ? t(s) : Promise.resolve(s).then(n, o);
  }
  function o(e) {
    return function () {
      var t = this,
        r = arguments;
      return new Promise(function (o, a) {
        var i = e.apply(t, r);
        function c(e) {
          n(i, o, a, c, s, 'next', e);
        }
        function s(e) {
          n(i, o, a, c, s, 'throw', e);
        }
        c(void 0);
      });
    };
  }
  (e.d = (t, r) => {
    for (var n in r)
      e.o(r, n) &&
        !e.o(t, n) &&
        Object.defineProperty(t, n, { enumerable: !0, get: r[n] });
  }),
    (e.o = (e, t) => Object.prototype.hasOwnProperty.call(e, t));
  var a = window.supabase.createClient(
    'https://mwhtclxabiraowerfmkz.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aHRjbHhhYmlyYW93ZXJmbWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDY2MjksImV4cCI6MjA1NjI4MjYyOX0.jwnn4sR78xx08p-8V8d-gSU9EHCjPPnT376Vt9KDO3Q'
  );
  function i() {
    return window.location.pathname.includes('questions.html')
      ? 'https://imtehanh.app.n8n.cloud/webhook/62085562-ce3e-4f5a-bae0-5e52e83b3eb8/chat'
      : 'https://imtehanh.app.n8n.cloud/webhook/35c57195-69e7-44ff-bebf-7c021c965089/chat';
  }
  var c, s, u, l;
  function p() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
      /[xy]/g,
      function (e) {
        var t = (16 * Math.random()) | 0;
        return ('x' === e ? t : (3 & t) | 8).toString(16);
      }
    );
  }
  function f() {
    return h.apply(this, arguments);
  }
  function h() {
    return (h = o(
      r().mark(function e() {
        var t, n, o, i, c, s, u, l;
        return r().wrap(
          function (e) {
            for (;;)
              switch ((e.prev = e.next)) {
                case 0:
                  return (e.prev = 0), (e.next = 4), a.auth.getUser();
                case 4:
                  if (((t = e.sent), (n = t.data.user), !t.error)) {
                    e.next = 10;
                    break;
                  }
                  throw new Error('Failed to get user information');
                case 10:
                  if (n) {
                    e.next = 15;
                    break;
                  }
                  return (o = p()), e.abrupt('return', o);
                case 15:
                  return (
                    (e.next = 18),
                    a
                      .from('student_sessions')
                      .select('id')
                      .eq('student_id', n.id)
                      .is('ended_at', null)
                      .order('started_at', { ascending: !1 })
                      .limit(1)
                  );
                case 18:
                  if (((i = e.sent), (c = i.data), !i.error)) {
                    e.next = 25;
                    break;
                  }
                  e.next = 28;
                  break;
                case 25:
                  if (!(c && c.length > 0)) {
                    e.next = 28;
                    break;
                  }
                  return e.abrupt('return', c[0].id);
                case 28:
                  return (
                    (e.next = 30),
                    a
                      .from('student_sessions')
                      .insert([
                        {
                          student_id: n.id,
                          topic_id: 1,
                          started_at: new Date().toISOString(),
                          last_active: new Date().toISOString(),
                        },
                      ])
                      .select()
                  );
                case 30:
                  if (((s = e.sent), (u = s.data), !s.error)) {
                    e.next = 36;
                    break;
                  }
                  throw new Error('Failed to create session');
                case 36:
                  if (!(u && u.length > 0)) {
                    e.next = 39;
                    break;
                  }
                  return e.abrupt('return', u[0].id);
                case 39:
                  throw new Error('No session data returned');
                case 42:
                  return (
                    (e.prev = 42),
                    (e.t0 = e.catch(0)),
                    (l = p()),
                    e.abrupt('return', l)
                  );
                case 48:
                case 'end':
                  return e.stop();
              }
          },
          e,
          null,
          [[0, 42]]
        );
      })
    )).apply(this, arguments);
  }
  function d() {
    return m.apply(this, arguments);
  }
  function m() {
    return (m = o(
      r().mark(function e() {
        var t, n;
        return r().wrap(
          function (e) {
            for (;;)
              switch ((e.prev = e.next)) {
                case 0:
                  if (((e.prev = 0), l)) {
                    e.next = 3;
                    break;
                  }
                  return e.abrupt('return');
                case 3:
                  return (e.next = 5), a.auth.getUser();
                case 5:
                  if (((t = e.sent), (n = t.data.user))) {
                    e.next = 9;
                    break;
                  }
                  return e.abrupt('return');
                case 9:
                  return (
                    (e.next = 11),
                    a
                      .from('student_sessions')
                      .update({ last_active: new Date().toISOString() })
                      .eq('id', l)
                      .eq('student_id', n.id)
                  );
                case 11:
                  e.next = 16;
                  break;
                case 13:
                  (e.prev = 13), (e.t0 = e.catch(0));
                case 16:
                case 'end':
                  return e.stop();
              }
          },
          e,
          null,
          [[0, 13]]
        );
      })
    )).apply(this, arguments);
  }
  function v() {
    return y.apply(this, arguments);
  }
  function y() {
    return (y = o(
      r().mark(function e() {
        var t, n;
        return r().wrap(
          function (e) {
            for (;;)
              switch ((e.prev = e.next)) {
                case 0:
                  if (l) {
                    e.next = 5;
                    break;
                  }
                  return (e.next = 4), f();
                case 4:
                  l = e.sent;
                case 5:
                  return (
                    (e.prev = 5),
                    (t = { sessionId: l, chatInput: 'Connection test' }),
                    (e.next = 11),
                    fetch(i(), {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                      },
                      body: JSON.stringify(t),
                      signal: AbortSignal.timeout(3e4),
                    })
                  );
                case 11:
                  if ((n = e.sent).ok) {
                    e.next = 14;
                    break;
                  }
                  throw new Error(
                    'Server responded with status '.concat(n.status)
                  );
                case 14:
                  return (e.next = 16), n.text();
                case 16:
                  return (
                    e.sent,
                    document.querySelector('.chat-message') ||
                      E(
                        'Welcome! Im your AI tutor for IGCSE Business Studies, trained to align with the examiners requirements. I can help with case studies, examples, and detailed lessons, providing clear explanations and real-world examples. Im also here to assist with practice questions, mark schemes, and exam strategies. Let me know what topic youd like to explore!',
                        'bot'
                      ),
                    e.abrupt('return', !0)
                  );
                case 22:
                  return (
                    (e.prev = 22),
                    (e.t0 = e.catch(5)),
                    E(
                      'AbortError' === e.t0.name
                        ? '⚠️ Connection timed out. Please check your internet connection.'
                        : navigator.onLine
                          ? '⚠️ Connection error: '.concat(e.t0.message)
                          : '⚠️ You appear to be offline. Please check your internet connection.',
                      'bot'
                    ),
                    e.abrupt('return', !1)
                  );
                case 28:
                case 'end':
                  return e.stop();
              }
          },
          e,
          null,
          [[5, 22]]
        );
      })
    )).apply(this, arguments);
  }
  function b() {
    return g.apply(this, arguments);
  }
  function g() {
    return (g = o(
      r().mark(function e() {
        return r().wrap(
          function (e) {
            for (;;)
              switch ((e.prev = e.next)) {
                case 0:
                  if (
                    ((c = document.getElementById('chat-container')),
                    (s = document.getElementById('message-input')),
                    (u = document.getElementById('send-button')),
                    c && s && u)
                  ) {
                    e.next = 7;
                    break;
                  }
                  return e.abrupt('return', !1);
                case 7:
                  return (e.prev = 7), (e.next = 10), f();
                case 10:
                  (l = e.sent), (e.next = 18);
                  break;
                case 14:
                  return (
                    (e.prev = 14), (e.t0 = e.catch(7)), e.abrupt('return', !1)
                  );
                case 18:
                  return (e.next = 20), v();
                case 20:
                  return (
                    e.sent,
                    s.addEventListener('keypress', function (e) {
                      'Enter' !== e.key ||
                        e.shiftKey ||
                        (e.preventDefault(), x());
                    }),
                    u && u.addEventListener('click', x),
                    e.abrupt('return', !0)
                  );
                case 26:
                case 'end':
                  return e.stop();
              }
          },
          e,
          null,
          [[7, 14]]
        );
      })
    )).apply(this, arguments);
  }
  function x() {
    return w.apply(this, arguments);
  }
  function w() {
    return (w = o(
      r().mark(function e() {
        var t, n, o, a, p, h, m, v;
        return r().wrap(
          function (e) {
            for (;;)
              switch ((e.prev = e.next)) {
                case 0:
                  if (s && c) {
                    e.next = 4;
                    break;
                  }
                  return e.abrupt('return');
                case 4:
                  if ((t = s.value.trim())) {
                    e.next = 7;
                    break;
                  }
                  return e.abrupt('return');
                case 7:
                  if (
                    (u && ((u.disabled = !0), (u.innerHTML = '⌛')),
                    (n = 0),
                    (e.prev = 10),
                    E(t, 'user'),
                    ((o = document.createElement('div')).className =
                      'chat-message bot-message'),
                    (o.innerHTML =
                      '\n            <div class="message-content">\n                <div class="thinking-animation">\n                    <span>.</span><span>.</span><span>.</span>\n                </div>\n            </div>\n        '),
                    c.appendChild(o),
                    (c.scrollTop = c.scrollHeight),
                    l)
                  ) {
                    e.next = 21;
                    break;
                  }
                  return (e.next = 20), f();
                case 20:
                  l = e.sent;
                case 21:
                  a = { sessionId: l, chatInput: t };
                case 23:
                  if (!(n < 3)) {
                    e.next = 74;
                    break;
                  }
                  return (
                    (e.prev = 24),
                    (e.next = 27),
                    fetch(i(), {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                      },
                      body: JSON.stringify(a),
                      signal: AbortSignal.timeout(3e4),
                    })
                  );
                case 27:
                  if ((p = e.sent).ok) {
                    e.next = 30;
                    break;
                  }
                  throw new Error(
                    'Server responded with status '.concat(p.status)
                  );
                case 30:
                  return (e.next = 32), p.text();
                case 32:
                  if (
                    ((h = e.sent), (m = void 0), (e.prev = 35), !h || !h.trim())
                  ) {
                    e.next = 48;
                    break;
                  }
                  if (!(v = JSON.parse(h)).output) {
                    e.next = 45;
                    break;
                  }
                  (m = (m = v.output).replace(/\r\n/g, '\n')), (e.next = 46);
                  break;
                case 45:
                  throw new Error('No output field in response');
                case 46:
                  e.next = 49;
                  break;
                case 48:
                  throw new Error('Empty response from server');
                case 49:
                  e.next = 55;
                  break;
                case 51:
                  (e.prev = 51),
                    (e.t0 = e.catch(35)),
                    (m =
                      "Sorry, I couldn't process the response properly. Please try again.");
                case 55:
                  return (
                    o.remove(), E(m, 'bot'), (s.value = ''), (e.next = 60), d()
                  );
                case 60:
                  return e.abrupt('return');
                case 63:
                  if (((e.prev = 63), (e.t1 = e.catch(24)), !(++n < 3))) {
                    e.next = 71;
                    break;
                  }
                  return (
                    (e.next = 70),
                    new Promise(function (e) {
                      return setTimeout(e, 1e3);
                    })
                  );
                case 70:
                  return e.abrupt('continue', 23);
                case 71:
                  throw e.t1;
                case 72:
                  e.next = 23;
                  break;
                case 74:
                  e.next = 82;
                  break;
                case 76:
                  (e.prev = 76),
                    (e.t2 = e.catch(10)),
                    o && o.remove(),
                    E(
                      'AbortError' === e.t2.name
                        ? 'The request took too long to complete. Please try again.'
                        : navigator.onLine
                          ? 'Error: '.concat(e.t2.message)
                          : 'You appear to be offline. Please check your internet connection.',
                      'bot'
                    );
                case 82:
                  return (
                    (e.prev = 82),
                    u && ((u.disabled = !1), (u.innerHTML = '➤')),
                    e.finish(82)
                  );
                case 85:
                case 'end':
                  return e.stop();
              }
          },
          e,
          null,
          [
            [10, 76, 82, 85],
            [24, 63],
            [35, 51],
          ]
        );
      })
    )).apply(this, arguments);
  }
  function k(e) {
    if ('undefined' == typeof marked)
      return (
        new Promise(function (e, t) {
          if ('undefined' == typeof marked) {
            var r = document.createElement('script');
            (r.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js'),
              (r.onload = e),
              (r.onerror = t),
              document.head.appendChild(r);
          } else e();
        }).then(function () {
          var t = k(e),
            r = document.querySelector('.pending-format');
          r && ((r.innerHTML = t), r.classList.remove('pending-format'));
        }),
        '<div class="pending-format">Loading formatter...</div>'
      );
    marked.setOptions({ gfm: !0, breaks: !0, headerIds: !1, mangle: !1 });
    var t = e;
    t = (t = t.replace(/----+/g, ' '))
      .replace(
        /\*\*"([^"]+)"\*\*/g,
        '<span style="color: #00C46F; font-weight: bold;">$1</span>'
      )
      .replace(
        /\*\*([^*\n]+)\*\*/g,
        '<span style="color: #00C46F; font-weight: bold;">$1</span>'
      );
    try {
      var r = marked
        .parse(t)
        .replace(/<table>/g, '<table class="markdown-table">')
        .replace(
          /<table class="markdown-table">/g,
          '<div class="table-container"><table class="markdown-table">'
        )
        .replace(/<\/table>/g, '</table></div>');
      return (
        '\n        <style>\n        .table-container {\n            overflow-x: auto;\n            margin: 15px 0;\n        }\n        .markdown-table {\n            border-collapse: collapse;\n            width: 100%;\n            margin: 0;\n            font-size: 0.9em;\n        }\n        .markdown-table th {\n            background-color: #2a2a2a;\n            color: white;\n            font-weight: bold;\n            padding: 10px;\n            border: 1px solid #444;\n            text-align: left;\n        }\n        .markdown-table td {\n            padding: 8px 10px;\n            border: 1px solid #444;\n            text-align: left;\n        }\n        .markdown-table tr:nth-child(even) {\n            background-color: #333;\n        }\n        .markdown-table tr:hover {\n            background-color: #3a3a3a;\n        }\n        code {\n            background-color: #f0f0f0;\n            padding: 2px 4px;\n            border-radius: 3px;\n            font-family: monospace;\n            color: #333;\n        }\n        pre {\n            background-color: #2d2d2d;\n            padding: 16px;\n            border-radius: 4px;\n            overflow-x: auto;\n            color: #ccc;\n        }\n        pre code {\n            background-color: transparent;\n            padding: 0;\n            color: inherit;\n        }\n        </style>\n        ' +
        r
      );
    } catch (t) {
      return '<p>'.concat(e, '</p>');
    }
  }
  function E(e, t) {
    var r = document.getElementById('chat-container');
    if (r) {
      var n = document.createElement('div');
      n.className = 'chat-message '.concat(t, '-message');
      var o = document.createElement('div');
      o.className = 'message-content';
      try {
        var a = k(e);
        o.innerHTML = a;
      } catch (t) {
        o.textContent = e;
      }
      n.appendChild(o),
        r.appendChild(n),
        n.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  o(
    r().mark(function e() {
      return r().wrap(function (e) {
        for (;;)
          switch ((e.prev = e.next)) {
            case 0:
              return (e.next = 2), b();
            case 2:
            case 'end':
              return e.stop();
          }
      }, e);
    })
  )();
})();
