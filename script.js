// Supabase connection
const supabaseUrl = 'https://ykebkcwraidkykfxfedt.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrZWJrY3dyYWlka3lrZnhmZWR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NTQ5NTAsImV4cCI6MjEwNTMzMDk1MH0.5F8kjCt4wOKt8I3PBv2azCwcXmYRKYw9e9Xh-xrlZgg'
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey)

let currentRole = 'guest'

function showLogin() {
  hideSignup()
  document.getElementById('loginSection').classList.remove('hidden')
}

function hideLogin() {
  document.getElementById('loginSection').classList.add('hidden')
  document.getElementById('loginMsg').innerText = ''
}

function showSignup() {
  hideLogin()
  document.getElementById('signupSection').classList.remove('hidden')
}

function hideSignup() {
  document.getElementById('signupSection').classList.add('hidden')
  document.getElementById('signupMsg').innerText = ''
}

async function login() {
  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  const loginMessage = document.getElementById('loginMsg')

  if (!email || !password) {
    loginMessage.innerText = 'Enter your email and password.'
    return
  }

  loginMessage.innerText = 'Signing in...'

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password })
    if (error) {
      loginMessage.innerText = error.message
      return
    }

    hideLogin()
    await checkUser()
    await loadNews()
    await loadMatches()
  } catch (error) {
    loginMessage.innerText = `Login failed: ${error.message}`
  }
}

async function logout() {
  const { error } = await supabaseClient.auth.signOut()
  if (error) {
    document.getElementById('userInfo').innerText = error.message
    return
  }
  await checkUser()
  await loadNews()
  await loadMatches()
}

async function signup() {
  const email = document.getElementById('signupEmail').value.trim()
  const password = document.getElementById('signupPassword').value
  const role = document.getElementById('signupRole').value
  const signupMessage = document.getElementById('signupMsg')

  if (!email || !password) {
    signupMessage.innerText = 'Enter an email and password.'
    return
  }

  if (password.length < 6) {
    signupMessage.innerText = 'Password must be at least 6 characters.'
    return
  }

  signupMessage.innerText = 'Creating account...'

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { role } }
    })

    if (error) {
      signupMessage.innerText = error.message
      return
    }

    if (data.session) {
      await supabaseClient.from('profiles').upsert({ id: data.user.id, role })
      hideSignup()
      await checkUser()
      await loadNews()
      await loadPlayerProfiles()
    } else {
      signupMessage.innerText = 'Account created. Check your email to confirm it, then log in.'
    }
  } catch (error) {
    signupMessage.innerText = `Signup failed: ${error.message}`
  }
}

async function checkUser() {
  const { data: { user } } = await supabaseClient.auth.getUser()
  const adminSection = document.getElementById('adminSection')
  const userInfo = document.getElementById('userInfo')
  const loginButton = document.getElementById('showLoginBtn')
  const logoutButton = document.getElementById('logoutBtn')
  const signupButton = document.getElementById('showSignupBtn')

  if (!user) {
    currentRole = 'guest'
    userInfo.innerText = ''
    loginButton.classList.remove('hidden')
    logoutButton.classList.add('hidden')
    signupButton.classList.remove('hidden')
    adminSection.classList.add('hidden')
    return
  }

  currentRole = user.user_metadata?.role || 'staff'
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile && profile.role) currentRole = profile.role
  if (profileError) console.warn('Profile lookup failed:', profileError.message)

  userInfo.innerText = user.email
  loginButton.classList.add('hidden')
  logoutButton.classList.remove('hidden')
  signupButton.classList.add('hidden')
  adminSection.classList.toggle('hidden', currentRole !== 'admin')
}

function canView(audience) {
  return currentRole === 'admin' || audience === 'all' || audience === currentRole
}

async function loadNews() {
  const newsList = document.getElementById('newsList')
  const adminNewsList = document.getElementById('adminNewsList')
  const { data, error } = await supabaseClient.from('news').select('*').order('created_at', { ascending: false })

  if (error) {
    newsList.innerText = `Unable to load news: ${error.message}`
    if (adminNewsList) adminNewsList.innerText = `Unable to load news: ${error.message}`
    return
  }

  const allNews = data || []
  const visibleNews = allNews.filter(item => canView(item.audience))
  newsList.innerHTML = visibleNews.length
    ? visibleNews.map(item => `<article class="card news-item"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content)}</p></article>`).join('')
    : '<p>No news available.</p>'

  if (adminNewsList) {
    adminNewsList.innerHTML = currentRole === 'admin'
      ? (allNews.length
        ? allNews.map(item => `<article class="card"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content)}</p><button class="btn-red" data-delete-news="${escapeHtml(item.id)}" type="button">Delete</button></article>`).join('')
        : '<p>No news to manage.</p>')
      : ''
  }
}

async function deleteNews(id) {
  if (currentRole !== 'admin') return
  if (!confirm('Delete this news item? This cannot be undone.')) return

  const { error } = await supabaseClient.from('news').delete().eq('id', id)
  if (error) {
    alert(`Could not delete news: ${error.message}`)
    return
  }

  await loadNews()
}

async function loadMatches() {
  const matchList = document.getElementById('matchList')
  const completedAdminList = document.getElementById('adminCompletedMatches')
  const { data, error } = await supabaseClient.from('matches').select('*').order('match_date', { ascending: true })

  if (error) {
    matchList.innerText = `Unable to load matches: ${error.message}`
    if (completedAdminList) completedAdminList.innerText = `Unable to load matches: ${error.message}`
    return
  }

  const allMatches = data || []
  const visibleMatches = allMatches.filter(item => canView(item.audience))
  const completedMatches = visibleMatches.filter(item => item.status === 'completed')
  const upcomingMatches = visibleMatches.filter(item => item.status !== 'completed')
  const adminCompletedMatches = allMatches.filter(item => item.status === 'completed')
  const homeTeamName = item => item.home_team || item.title || 'Home team'
  const awayTeamName = item => item.away_team || item.opponent || 'Away team'
  const renderMatch = (item, isResult) => `<article class="card match-item ${isResult ? 'match-result' : 'match-fixture'}">
    <span class="match-status">${isResult ? 'Full time' : 'Upcoming'}</span>
    <h3 class="match-teams">${escapeHtml(homeTeamName(item))}<span aria-hidden="true">vs</span>${escapeHtml(awayTeamName(item))}</h3>
    ${isResult ? `<p class="match-score">${item.home_score ?? 0} <span aria-label="to">-</span> ${item.away_score ?? 0}</p>` : ''}
    <p class="match-details">${escapeHtml(formatMatchDate(item.match_date))}<span aria-hidden="true">|</span>${escapeHtml(item.venue)}</p>
  </article>`

  matchList.innerHTML = `<section class="match-group"><h3 class="match-group-title">Upcoming Fixtures</h3>${upcomingMatches.length ? upcomingMatches.map(item => renderMatch(item, false)).join('') : '<p class="empty-match-state">No upcoming fixtures.</p>'}</section>
    <section class="match-group"><h3 class="match-group-title">Recent Results</h3>${completedMatches.length ? completedMatches.map(item => renderMatch(item, true)).join('') : '<p class="empty-match-state">No results have been posted.</p>'}</section>`

  if (completedAdminList) {
    completedAdminList.innerHTML = currentRole === 'admin'
      ? (adminCompletedMatches.length
        ? adminCompletedMatches.map(item => renderAdminMatch(item, true, homeTeamName, awayTeamName)).join('')
        : '<p class="empty-match-state">No completed matches to manage.</p>')
      : ''
  }
}

function renderAdminMatch(item, isCompleted, homeTeamName, awayTeamName) {
  const matchId = escapeHtml(item.id)
  const homeTeam = homeTeamName(item)
  const awayTeam = awayTeamName(item)
  return `<article class="card match-admin-item">
    <div class="match-admin-copy"><h4>${escapeHtml(homeTeam)} vs ${escapeHtml(awayTeam)}</h4><p>${escapeHtml(formatMatchDate(item.match_date))} · ${escapeHtml(item.venue)}</p></div>
    <div class="match-admin-controls">
      <label class="match-team-entry"><span>Home team</span><input type="text" aria-label="Home team name" value="${escapeHtml(homeTeam)}" data-home-team="${matchId}"></label>
      <label class="match-score-entry"><span>${escapeHtml(homeTeam)} goals</span><input type="number" min="0" step="1" aria-label="${escapeHtml(homeTeam)} goals" placeholder="Goals" value="${item.home_score ?? ''}" data-home-score="${matchId}"></label>
      <span aria-hidden="true">-</span>
      <label class="match-score-entry"><span>${escapeHtml(awayTeam)} goals</span><input type="number" min="0" step="1" aria-label="${escapeHtml(awayTeam)} goals" placeholder="Goals" value="${item.away_score ?? ''}" data-away-score="${matchId}"></label>
      <label class="match-team-entry"><span>Away team</span><input type="text" aria-label="Away team name" value="${escapeHtml(awayTeam)}" data-away-team="${matchId}"></label>
      <button class="btn-green" data-save-result="${matchId}" type="button">Save Result</button>
      <button class="btn-red" data-delete-match="${matchId}" type="button">Delete</button>
    </div>
  </article>`
}

function formatMatchDate(value) {
  if (!value) return 'Date to be confirmed'
  const parsedDate = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsedDate.getTime())
    ? String(value)
    : parsedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

async function saveManagedMatch(id, status) {
  if (currentRole !== 'admin') return

  const homeTeamInput = document.querySelector(`[data-home-team="${CSS.escape(id)}"]`)
  const awayTeamInput = document.querySelector(`[data-away-team="${CSS.escape(id)}"]`)
  const homeScoreInput = document.querySelector(`[data-home-score="${CSS.escape(id)}"]`)
  const awayScoreInput = document.querySelector(`[data-away-score="${CSS.escape(id)}"]`)
  const homeTeam = homeTeamInput.value.trim()
  const awayTeam = awayTeamInput.value.trim()
  const homeScore = homeScoreInput.value === '' ? null : Number(homeScoreInput.value)
  const awayScore = awayScoreInput.value === '' ? null : Number(awayScoreInput.value)

  if (!homeTeam || !awayTeam || homeTeam.toLocaleLowerCase() === awayTeam.toLocaleLowerCase()) {
    alert('Enter two different team names.')
    return
  }

  if (status === 'completed' && (homeScore === null || awayScore === null || !Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0)) {
    alert('Enter a valid non-negative whole-number score for both teams before marking the match completed.')
    return
  }

  const { data, error } = await supabaseClient.from('matches').update({
    home_team: homeTeam,
    away_team: awayTeam,
    title: `${homeTeam} vs ${awayTeam}`,
    opponent: awayTeam,
    status,
    home_score: homeScore,
    away_score: awayScore
  }).eq('id', id).select('id')

  if (error) {
    alert(`Could not update match: ${error.message}`)
    return
  }
  if (data.length !== 1) {
    alert(`Expected to update one match, but updated ${data.length}. Check that every match has a unique ID.`)
    return
  }

  await loadMatches()
}

async function reopenMatch(id) {
  if (currentRole !== 'admin') return
  const { error } = await supabaseClient.from('matches').update({ status: 'upcoming' }).eq('id', id)
  if (error) {
    alert(`Could not reopen fixture: ${error.message}`)
    return
  }
  await loadMatches()
}

async function loadPlayerProfiles() {
  const scorersList = document.getElementById('topScorersList')
  const assistsList = document.getElementById('topAssistsList')
  const adminList = document.getElementById('adminPlayerProfilesList')
  const publicList = document.getElementById('playerProfilesList')
  const { data, error } = await supabaseClient
    .from('player_profiles')
    .select('*')
    .order('goals', { ascending: false })
    .order('assists', { ascending: false })

  if (error) {
    const message = `Unable to load player profiles: ${error.message}`
    scorersList.innerHTML = `<li>${escapeHtml(message)}</li>`
    assistsList.innerHTML = `<li>${escapeHtml(message)}</li>`
    if (adminList) adminList.innerText = message
    if (publicList) publicList.innerHTML = `<p class="player-directory-message">${escapeHtml(message)}</p>`
    return
  }

  const players = data || []
  const topScorers = [...players].sort((first, second) => second.goals - first.goals || second.assists - first.assists).slice(0, 5)
  const topAssists = [...players].sort((first, second) => second.assists - first.assists || second.goals - first.goals).slice(0, 5)

  scorersList.innerHTML = topScorers.length
    ? topScorers.map(player => `<li><span>${escapeHtml(player.full_name)}</span><strong>${player.goals} ${player.goals === 1 ? 'goal' : 'goals'}</strong></li>`).join('')
    : '<li>No scorer stats yet.</li>'
  assistsList.innerHTML = topAssists.length
    ? topAssists.map(player => `<li><span>${escapeHtml(player.full_name)}</span><strong>${player.assists} ${player.assists === 1 ? 'assist' : 'assists'}</strong></li>`).join('')
    : '<li>No assist stats yet.</li>'

  if (adminList) {
    adminList.innerHTML = currentRole === 'admin'
      ? (players.length
        ? players.map(player => `<article class="card player-admin-item"><div class="player-admin-identity">${player.photo_url ? `<img src="${escapeHtml(player.photo_url)}" alt="">` : '<span class="player-avatar-fallback" aria-hidden="true"></span>'}<div><h4>${escapeHtml(player.full_name)}</h4><p>${player.matches_played} matches · ${player.goals} goals · ${player.assists} assists</p></div></div><div class="player-admin-actions"><button class="btn-cancel" data-edit-player-profile="${escapeHtml(player.id)}" type="button">Edit</button><button class="btn-red" data-delete-player-profile="${escapeHtml(player.id)}" type="button">Delete</button></div></article>`).join('')
        : '<p>No player profiles to manage.</p>')
      : ''
  }

  if (publicList) {
    publicList.innerHTML = players.length
      ? players.map(player => `<article class="player-profile-card">
          ${player.photo_url ? `<img class="player-profile-photo" src="${escapeHtml(player.photo_url)}" alt="Photo of ${escapeHtml(player.full_name)}" loading="lazy">` : '<div class="player-profile-photo player-profile-placeholder" aria-hidden="true">GASFA</div>'}
          <div class="player-profile-info"><h3>${escapeHtml(player.full_name)}</h3><p class="player-appearances">${player.matches_played} matches played</p><dl><div><dt>Goals</dt><dd>${player.goals}</dd></div><div><dt>Assists</dt><dd>${player.assists}</dd></div></dl></div>
        </article>`).join('')
      : '<p class="player-directory-message">No player profiles have been added yet.</p>'
  }
}

function openPlayerProfiles() {
  const dialog = document.getElementById('playerProfilesDialog')
  loadPlayerProfiles()
  if (!dialog.open) dialog.showModal()
}

function closePlayerProfiles() {
  document.getElementById('playerProfilesDialog').close()
}

async function savePlayerProfile() {
  if (currentRole !== 'admin') return
  const fullName = document.getElementById('p_name').value.trim()
  const photoFile = document.getElementById('p_photo').files[0]
  const matchesPlayed = Number(document.getElementById('p_matches').value)
  const goals = Number(document.getElementById('p_goals').value)
  const assists = Number(document.getElementById('p_assists').value)
  const message = document.getElementById('playerProfileMsg')

  if (!fullName || !Number.isInteger(matchesPlayed) || matchesPlayed < 0 || !Number.isInteger(goals) || goals < 0 || !Number.isInteger(assists) || assists < 0) {
    message.innerText = 'Enter a player name and valid non-negative whole numbers for all stats.'
    return
  }

  if (photoFile && (!photoFile.type.startsWith('image/') || photoFile.size > 5 * 1024 * 1024)) {
    message.innerText = 'Choose an image file smaller than 5 MB.'
    return
  }

  const saveButton = document.querySelector('#adminSection .admin-card button[onclick="savePlayerProfile()"]')
  saveButton.disabled = true
  message.innerText = 'Saving player profile...'

  try {
    const profile = { full_name: fullName, matches_played: matchesPlayed, goals, assists }
    if (photoFile) {
      const safeFileName = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const storagePath = `${Date.now()}-${safeFileName}`
      const { error: uploadError } = await supabaseClient.storage
        .from('player-photos')
        .upload(storagePath, photoFile, { upsert: false })
      if (uploadError) {
        message.innerText = `Photo upload failed: ${uploadError.message}`
        return
      }
      profile.photo_url = supabaseClient.storage.from('player-photos').getPublicUrl(storagePath).data.publicUrl
    }

    const editingId = document.getElementById('p_name').dataset.editingId
    const saveResponse = editingId
      ? await supabaseClient.from('player_profiles').update(profile).eq('id', editingId)
      : await supabaseClient.from('player_profiles').insert(profile)
    const { error } = saveResponse
    if (error) {
      message.innerText = `Could not save profile: ${error.message}`
      return
    }

    document.getElementById('p_name').value = ''
    delete document.getElementById('p_name').dataset.editingId
    document.getElementById('p_photo').value = ''
    document.getElementById('p_matches').value = '0'
    document.getElementById('p_goals').value = '0'
    document.getElementById('p_assists').value = '0'
    message.innerText = 'Player profile saved.'
    await loadPlayerProfiles()
  } catch (error) {
    message.innerText = `Could not save profile: ${error.message}`
  } finally {
    saveButton.disabled = false
  }
}

async function deletePlayerProfile(id) {
  if (currentRole !== 'admin') return
  if (!confirm('Delete this player profile? This cannot be undone.')) return

  const { error } = await supabaseClient.from('player_profiles').delete().eq('id', id)
  if (error) {
    alert(`Could not delete player profile: ${error.message}`)
    return
  }

  await loadPlayerProfiles()
}

async function editPlayerProfile(id) {
  if (currentRole !== 'admin') return
  const { data, error } = await supabaseClient.from('player_profiles').select('*').eq('id', id).single()
  if (error) {
    alert(`Could not load player profile: ${error.message}`)
    return
  }

  document.getElementById('p_name').value = data.full_name
  document.getElementById('p_matches').value = data.matches_played
  document.getElementById('p_goals').value = data.goals
  document.getElementById('p_assists').value = data.assists
  document.getElementById('playerProfileMsg').innerText = 'Editing this profile. Leave photo empty to keep the current photo.'
  document.getElementById('p_name').dataset.editingId = data.id
  document.getElementById('p_name').scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function deleteMatch(id) {
  if (currentRole !== 'admin') return
  if (!confirm('Delete this match? This cannot be undone.')) return

  const { error } = await supabaseClient.from('matches').delete().eq('id', id)
  if (error) {
    alert(`Could not delete match: ${error.message}`)
    return
  }

  await loadMatches()
}

async function addNews() {
  const { error } = await supabaseClient.from('news').insert({
    title: document.getElementById('n_title').value.trim(),
    content: document.getElementById('n_content').value.trim(),
    opponent: document.getElementById('n_opponent').value.trim(),
    audience: document.getElementById('n_audience').value
  })

  if (error) {
    alert(error.message)
    return
  }

  document.getElementById('n_title').value = ''
  document.getElementById('n_content').value = ''
  document.getElementById('n_opponent').value = ''
  await loadNews()
}

async function addMatch() {
  const homeTeam = document.getElementById('m_home_team').value.trim()
  const awayTeam = document.getElementById('m_away_team').value.trim()
  const homeScore = Number(document.getElementById('m_home_score').value)
  const awayScore = Number(document.getElementById('m_away_score').value)
  const matchDate = document.getElementById('m_date').value
  const venue = document.getElementById('m_venue').value.trim()
  const message = document.getElementById('matchFormMsg')

  if (!homeTeam || !awayTeam || !matchDate || !venue || !Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
    message.innerText = 'Enter both team names, a valid score for each team, the match date, and venue.'
    return
  }
  if (homeTeam.toLocaleLowerCase() === awayTeam.toLocaleLowerCase()) {
    message.innerText = 'Home and away teams must be different.'
    return
  }

  const saveButton = document.querySelector('#adminSection button[onclick="addMatch()"]')
  saveButton.disabled = true
  message.innerText = 'Saving completed match...'

  const { data, error } = await supabaseClient.from('matches').insert({
    title: `${homeTeam} vs ${awayTeam}`,
    opponent: awayTeam,
    home_team: homeTeam,
    away_team: awayTeam,
    home_score: homeScore,
    away_score: awayScore,
    match_date: matchDate,
    venue,
    audience: document.getElementById('m_audience').value,
    status: 'completed'
  }).select('id').single()
  saveButton.disabled = false

  if (error) {
    message.innerText = `Could not save match: ${error.message}`
    return
  }
  if (!data?.id) {
    message.innerText = 'The match was not saved with a unique ID. Check the matches table ID column.'
    return
  }

  document.getElementById('m_home_team').value = ''
  document.getElementById('m_home_score').value = ''
  document.getElementById('m_away_team').value = ''
  document.getElementById('m_away_score').value = ''
  document.getElementById('m_date').value = ''
  document.getElementById('m_venue').value = ''
  message.innerText = 'Completed match saved. You can add another match now.'
  await loadMatches()
}

async function addUpcomingMatch() {
  if (currentRole !== 'admin') return

  const homeTeam = document.getElementById('u_home_team').value.trim()
  const awayTeam = document.getElementById('u_away_team').value.trim()
  const matchDate = document.getElementById('u_date').value
  const venue = document.getElementById('u_venue').value.trim()
  const message = document.getElementById('upcomingMatchMsg')

  if (!homeTeam || !awayTeam || !matchDate || !venue) {
    message.innerText = 'Enter both team names, match date, and venue.'
    return
  }
  if (homeTeam.toLocaleLowerCase() === awayTeam.toLocaleLowerCase()) {
    message.innerText = 'Home and away teams must be different.'
    return
  }

  const button = document.querySelector('#adminSection button[onclick="addUpcomingMatch()"]')
  button.disabled = true
  message.innerText = 'Saving upcoming match...'

  try {
    const { data, error } = await supabaseClient.from('matches').insert({
      title: `${homeTeam} vs ${awayTeam}`,
      opponent: awayTeam,
      home_team: homeTeam,
      away_team: awayTeam,
      match_date: matchDate,
      venue,
      audience: document.getElementById('u_audience').value,
      status: 'upcoming',
      home_score: null,
      away_score: null
    }).select('id').single()

    if (error) {
      message.innerText = `Could not save upcoming match: ${error.message}`
      return
    }
    if (!data?.id) {
      message.innerText = 'The match was not saved with a unique ID.'
      return
    }

    document.getElementById('u_home_team').value = ''
    document.getElementById('u_away_team').value = ''
    document.getElementById('u_date').value = ''
    document.getElementById('u_venue').value = ''
    message.innerText = 'Upcoming match saved.'
    await loadMatches()
  } catch (error) {
    message.innerText = `Could not save upcoming match: ${error.message}`
  } finally {
    button.disabled = false
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character])
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('newsList').addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-delete-news]')
    if (deleteButton) deleteNews(deleteButton.dataset.deleteNews)
  })
  document.getElementById('adminNewsList').addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-delete-news]')
    if (deleteButton) deleteNews(deleteButton.dataset.deleteNews)
  })
  document.getElementById('adminCompletedMatches').addEventListener('click', event => {
    const saveButton = event.target.closest('[data-save-result]')
    if (saveButton) saveManagedMatch(saveButton.dataset.saveResult, 'completed')
    const deleteButton = event.target.closest('[data-delete-match]')
    if (deleteButton) deleteMatch(deleteButton.dataset.deleteMatch)
  })
  document.getElementById('adminPlayerProfilesList').addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-delete-player-profile]')
    if (deleteButton) deletePlayerProfile(deleteButton.dataset.deletePlayerProfile)
    const editButton = event.target.closest('[data-edit-player-profile]')
    if (editButton) editPlayerProfile(editButton.dataset.editPlayerProfile)
  })

  document.getElementById('playerProfilesDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) closePlayerProfiles()
  })

  await checkUser()
  await Promise.all([loadNews(), loadMatches(), loadPlayerProfiles()])
})

supabaseClient.auth.onAuthStateChange(() => {
  setTimeout(async () => {
    await checkUser()
    await loadNews()
    await loadMatches()
    await loadPlayerProfiles()
  }, 0)
})
