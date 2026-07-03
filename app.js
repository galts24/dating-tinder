const SWIPE_THRESHOLD = 100;
const ROTATION_DIVISOR = 20;
const EXIT_DURATION = 300;
const STORAGE_KEY = 'flikt_session';

const appState = {
  user: { name: null, age: null },
  profiles: [],
  currentIndex: 0,
  isAnimating: false
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildShuffledProfiles() {
  const featured = PROFILES.filter((p) => p.featured);
  const rest = shuffle(PROFILES.filter((p) => !p.featured));
  return [...featured, ...rest];
}

function profilesFromOrder(ids) {
  if (!Array.isArray(ids)) return null;
  const byId = new Map(PROFILES.map((p) => [p.id, p]));
  const resolved = ids.map((id) => byId.get(id)).filter(Boolean);
  return resolved.length === PROFILES.length ? resolved : null;
}

const el = {
  onboardingScreen: document.getElementById('screen-onboarding'),
  deckScreen: document.getElementById('screen-deck'),
  onboardingForm: document.getElementById('onboarding-form'),
  inputName: document.getElementById('input-name'),
  inputAge: document.getElementById('input-age'),
  onboardingError: document.getElementById('onboarding-error'),
  locationText: document.getElementById('location-text'),
  cardStack: document.getElementById('card-stack'),
  btnPass: document.getElementById('btn-pass'),
  btnLike: document.getElementById('btn-like'),
  matchOverlay: document.getElementById('screen-match'),
  matchPhoto: document.getElementById('match-photo'),
  matchText: document.getElementById('match-text'),
  btnStartChat: document.getElementById('btn-start-chat'),
  btnKeepSwiping: document.getElementById('btn-keep-swiping')
};

function showScreen(name) {
  el.onboardingScreen.classList.toggle('hidden', name !== 'onboarding');
  el.deckScreen.classList.toggle('hidden', name !== 'deck');
}

function saveSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    name: appState.user.name,
    age: appState.user.age,
    currentIndex: appState.currentIndex,
    profileOrder: appState.profiles.map((p) => p.id)
  }));
}

function loadSession() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data || !data.name || !Number.isFinite(data.age)) return null;
    return data;
  } catch (_) {
    return null;
  }
}

el.onboardingForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = el.inputName.value.trim();
  const age = parseInt(el.inputAge.value, 10);

  if (!name) {
    return showOnboardingError('Please enter your name.');
  }
  if (!Number.isFinite(age) || age < 18 || age > 99) {
    return showOnboardingError('Please enter a valid age (18-99).');
  }

  el.onboardingError.classList.add('hidden');
  appState.user.name = name;
  appState.user.age = age;
  appState.profiles = buildShuffledProfiles();
  appState.currentIndex = 0;
  saveSession();

  showScreen('deck');
  initLocation();
  renderCardStack();
});

function showOnboardingError(message) {
  el.onboardingError.textContent = message;
  el.onboardingError.classList.remove('hidden');
}

function initLocation() {
  el.locationText.textContent = 'Finding people near you…';

  if (!navigator.geolocation) {
    el.locationText.textContent = 'Girls near you (geolocation not supported)';
    return;
  }

  navigator.geolocation.getCurrentPosition(onLocationSuccess, onLocationError, { timeout: 8000 });
}

function onLocationSuccess(position) {
  const { latitude, longitude } = position.coords;
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;

  fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const parts = [];
      if (data.locality && data.locality !== data.city) parts.push(data.locality);
      if (data.city) parts.push(data.city);
      if (parts.length === 0 && data.principalSubdivision) parts.push(data.principalSubdivision);

      const place = parts.join(', ');
      el.locationText.textContent = place ? `Girls near ${place}` : 'Girls near you';
    })
    .catch(() => {
      el.locationText.textContent = 'Girls near you (geocode lookup failed)';
    });
}

function onLocationError(err) {
  console.warn('Geolocation unavailable:', err && err.message);
  const reason = {
    1: 'location permission denied',
    2: 'location unavailable',
    3: 'location request timed out'
  }[err && err.code];
  el.locationText.textContent = reason ? `Girls near you (${reason})` : 'Girls near you';
}

function createCardElement(profile, position) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.position = position;

  if (position === 0) {
    card.style.zIndex = 3;
    card.style.transform = 'scale(1) translateY(0)';
  } else if (position === 1) {
    card.style.zIndex = 2;
    card.style.transform = 'scale(0.95) translateY(10px)';
  } else {
    card.style.zIndex = 1;
    card.style.transform = 'scale(0.9) translateY(20px)';
  }

  card.innerHTML = `
    <img src="${profile.photoUrl}" alt="${profile.name}" draggable="false">
    <div class="card-gradient"></div>
    <div class="card-stamp stamp-like">Like</div>
    <div class="card-stamp stamp-nope">Nope</div>
    <div class="card-info">
      <p class="card-name-age">${profile.name}, ${profile.age}${profile.online ? '<span class="online-badge"><span class="online-dot"></span>Online</span>' : ''}</p>
      <p>${profile.lookingFor}</p>
      <p>🍽️ Favorite food: ${profile.favoriteFood}</p>
      <p>💕 Perfect date: ${profile.perfectDate}</p>
    </div>
  `;

  if (position === 0) {
    attachDragHandlers(card);
  }

  return card;
}

function renderCardStack() {
  if (appState.currentIndex >= appState.profiles.length) {
    appState.profiles = buildShuffledProfiles();
    appState.currentIndex = 0;
    saveSession();
  }

  el.cardStack.innerHTML = '';
  const remaining = appState.profiles.slice(appState.currentIndex, appState.currentIndex + 3);

  remaining.forEach((profile, i) => {
    const card = createCardElement(profile, i);
    el.cardStack.appendChild(card);
  });
}

function attachDragHandlers(card) {
  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let deltaY = 0;
  let dragging = false;

  const likeStamp = card.querySelector('.stamp-like');
  const nopeStamp = card.querySelector('.stamp-nope');

  card.addEventListener('pointerdown', (e) => {
    if (appState.isAnimating) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    card.setPointerCapture(e.pointerId);
    card.style.transition = 'none';
  });

  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    deltaX = e.clientX - startX;
    deltaY = e.clientY - startY;
    const rotation = deltaX / ROTATION_DIVISOR;
    card.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${rotation}deg)`;

    const progress = Math.min(Math.abs(deltaX) / SWIPE_THRESHOLD, 1);
    if (deltaX > 0) {
      likeStamp.style.opacity = progress;
      nopeStamp.style.opacity = 0;
    } else {
      nopeStamp.style.opacity = progress;
      likeStamp.style.opacity = 0;
    }
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    try { card.releasePointerCapture(e.pointerId); } catch (_) {}

    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      commitSwipe(card, deltaX > 0 ? 1 : -1, deltaY);
    } else {
      snapBack(card, likeStamp, nopeStamp);
    }
    deltaX = 0;
    deltaY = 0;
  }

  card.addEventListener('pointerup', endDrag);
  card.addEventListener('pointercancel', endDrag);
}

function snapBack(card, likeStamp, nopeStamp) {
  card.style.transition = 'transform 0.3s ease';
  card.style.transform = 'translate(0px, 0px) rotate(0deg)';
  likeStamp.style.opacity = 0;
  nopeStamp.style.opacity = 0;
}

function commitSwipe(card, direction, deltaY) {
  if (appState.isAnimating) return;
  appState.isAnimating = true;

  const flyX = direction * 1000;
  const flyY = deltaY || -50;
  const rotation = direction * 30;

  card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  card.style.transform = `translate(${flyX}px, ${flyY}px) rotate(${rotation}deg)`;
  card.style.opacity = '0';

  const swipedProfile = appState.profiles[appState.currentIndex];

  setTimeout(() => {
    appState.currentIndex += 1;
    saveSession();
    renderCardStack();
    appState.isAnimating = false;

    if (direction > 0) {
      showMatch(swipedProfile);
    }
  }, EXIT_DURATION);
}

function swipeTopCard(direction) {
  if (appState.isAnimating) return;
  const topCard = el.cardStack.querySelector('.card[data-position="0"]');
  if (!topCard) return;
  commitSwipe(topCard, direction, -50);
}

el.btnPass.addEventListener('click', () => swipeTopCard(-1));
el.btnLike.addEventListener('click', () => swipeTopCard(1));

function showMatch(profile) {
  el.matchPhoto.src = profile.photoUrl;
  el.matchPhoto.alt = profile.name;
  el.matchText.textContent = `You and ${profile.name} have liked each other.`;
  el.matchOverlay.classList.remove('hidden');
}

function hideMatch() {
  el.matchOverlay.classList.add('hidden');
}

el.btnKeepSwiping.addEventListener('click', hideMatch);

el.btnStartChat.addEventListener('click', () => {
  window.open(CHAT_REDIRECT_URL, '_blank');
});

function init() {
  const session = loadSession();
  if (!session) return;

  appState.user.name = session.name;
  appState.user.age = session.age;
  appState.profiles = profilesFromOrder(session.profileOrder) || buildShuffledProfiles();
  appState.currentIndex = Number.isFinite(session.currentIndex) ? session.currentIndex : 0;

  showScreen('deck');
  initLocation();
  renderCardStack();
}

init();
