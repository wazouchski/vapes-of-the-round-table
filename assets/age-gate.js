// Age Verification Gate
// Shows once per browser session. 21+ proceeds, under 21 redirects to Google.
(function () {
  var COOKIE_KEY = 'rtw_age_verified';

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + value + '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  // Already verified this session — show nothing
  if (getCookie(COOKIE_KEY) === '1') return;

  // Build overlay
  var gate = document.createElement('div');
  gate.id = 'age-gate';
  gate.innerHTML =
    '<div class="age-gate-box">' +
      '<div class="age-gate-crest">⚜️</div>' +
      '<h2>Are You 21 or Older?</h2>' +
      '<p>The Round Table covers dry herb vaporizers and cannabis culture.<br>' +
      'You must be 21 or older to enter.</p>' +
      '<div class="age-gate-btns">' +
        '<button class="btn-enter" id="age-yes">Yes, Enter</button>' +
        '<button class="btn-leave" id="age-no">No, Leave</button>' +
      '</div>' +
      '<p class="age-gate-disclaimer">By entering you confirm you are of legal age in your jurisdiction.</p>' +
    '</div>';

  document.body.prepend(gate);

  document.getElementById('age-yes').addEventListener('click', function () {
    setCookie(COOKIE_KEY, '1', 30);
    gate.classList.add('hidden');
  });

  document.getElementById('age-no').addEventListener('click', function () {
    window.location.replace('https://www.google.com');
  });
})();
