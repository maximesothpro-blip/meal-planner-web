// Configuration Airtable et Telegram
const config = {
    airtable: {
        baseId: 'appJEGDcsnuU70vJM',
        tableId: 'tblD15BAgi3ZbTxnQ',
        planningTableId: 'YOUR_PLANNING_TABLE_ID', // À récupérer depuis Airtable
        token: localStorage.getItem('airtableToken') || ''
    },
    telegram: {
        botToken: localStorage.getItem('telegramToken') || '',
        chatId: localStorage.getItem('telegramChatId') || ''
    }
};

// Variables globales
let currentWeek = getWeekNumber(new Date());
let currentYear = new Date().getFullYear();
let recipes = [];
let planningData = [];
let lastUpdateId = 0; // Pour tracker les messages déjà reçus
let pollingInterval = null; // Pour le polling getUpdates
let processedMessageIds = new Set(); // Pour éviter les doublons

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    // Vérifier la configuration
    if (!config.airtable.token) {
        openConfig();
        addBotMessage("⚠️ Veuillez configurer votre token Airtable pour commencer.");
    } else {
        loadWeekPlanning();
        loadRecipes();
    }
    
    updateWeekDisplay();
    
    // Démarrer le polling Telegram si configuré
    if (config.telegram.botToken && config.telegram.chatId) {
        startTelegramPolling();
    }
}

function setupEventListeners() {
    document.getElementById('prevWeek').addEventListener('click', () => changeWeek(-1));
    document.getElementById('nextWeek').addEventListener('click', () => changeWeek(1));
}

// ==================== TELEGRAM getUpdates ====================

async function startTelegramPolling() {
    // Récupérer les 10 derniers messages au démarrage
    await getRecentMessages();
    
    // Démarrer le polling toutes les 2 secondes
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    pollingInterval = setInterval(async () => {
        await getTelegramUpdates();
    }, 2000);
    
    console.log('✅ Polling Telegram démarré');
}

async function getRecentMessages() {
    if (!config.telegram.botToken || !config.telegram.chatId) return;
    
    try {
        const response = await fetch(
            `https://api.telegram.org/bot${config.telegram.botToken}/getUpdates?limit=10&offset=-10`,
            {
                method: 'GET'
            }
        );
        
        if (response.ok) {
            const data = await response.json();
            if (data.ok && data.result.length > 0) {
                // Afficher uniquement les messages du bot
                data.result.forEach(update => {
                    if (update.message && update.message.chat.id.toString() === config.telegram.chatId) {
                        // Si c'est un message du bot (pas de from.is_bot ou from l'utilisateur)
                        if (update.message.from.id.toString() !== config.telegram.chatId) {
                            displayBotMessage(update.message);
                        }
                    }
                });
                
                // Mettre à jour le lastUpdateId pour ne pas re-traiter ces messages
                lastUpdateId = data.result[data.result.length - 1].update_id;
            }
        }
    } catch (error) {
        console.error('Erreur récupération messages récents:', error);
    }
}

async function getTelegramUpdates() {
    if (!config.telegram.botToken || !config.telegram.chatId) return;
    
    try {
        const offset = lastUpdateId + 1;
        const response = await fetch(
            `https://api.telegram.org/bot${config.telegram.botToken}/getUpdates?offset=${offset}&timeout=1`,
            {
                method: 'GET'
            }
        );
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.ok && data.result.length > 0) {
                data.result.forEach(update => {
                    // Vérifier que c'est bien notre chat
                    if (update.message && update.message.chat.id.toString() === config.telegram.chatId) {
                        // Afficher uniquement les messages du bot (pas les nôtres)
                        if (update.message.from.id.toString() !== config.telegram.chatId) {
                            displayBotMessage(update.message);
                        }
                    }
                    
                    // Mettre à jour le lastUpdateId
                    lastUpdateId = update.update_id;
                });
            }
        }
    } catch (error) {
        console.error('Erreur polling Telegram:', error);
    }
}

function displayBotMessage(message) {
    // Éviter les doublons
    if (processedMessageIds.has(message.message_id)) return;
    processedMessageIds.add(message.message_id);
    
    // Afficher le message du bot
    const text = message.text || '';
    if (text) {
        // Formatter le texte pour gérer le Markdown de Telegram
        const formattedText = formatTelegramMessage(text);
        addBotMessage(formattedText);
        
        // Si c'est une confirmation de recette, recharger les recettes
        if (text.includes('✅') && text.includes('Recette sauvegardée')) {
            setTimeout(() => loadRecipes(), 1000);
        }
    }
}

function formatTelegramMessage(text) {
    // Convertir le Markdown Telegram en HTML basique
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // **bold**
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // *italic*
        .replace(/\n/g, '<br>'); // retours à la ligne
}

// ==================== FIN TELEGRAM ====================

// Gestion des semaines
function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function getWeekDates(week, year) {
    const firstDayOfYear = new Date(year, 0, 1);
    const daysOffset = (week - 1) * 7 - firstDayOfYear.getDay() + 1;
    const monday = new Date(year, 0, 1 + daysOffset);
    
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        weekDates.push(date);
    }
    return weekDates;
}

function changeWeek(direction) {
    currentWeek += direction;
    
    if (currentWeek > 52) {
        currentWeek = 1;
        currentYear++;
    } else if (currentWeek < 1) {
        currentWeek = 52;
        currentYear--;
    }
    
    updateWeekDisplay();
    loadWeekPlanning();
}

function updateWeekDisplay() {
    document.getElementById('currentWeek').textContent = `Semaine ${currentWeek} - ${currentYear}`;
    renderPlanningGrid();
}

// Rendu du planning
function renderPlanningGrid() {
    const grid = document.getElementById('planningGrid');
    const weekDates = getWeekDates(currentWeek, currentYear);
    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    
    grid.innerHTML = '';
    
    weekDates.forEach((date, index) => {
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        
        const dateStr = date.toISOString().split('T')[0];
        const dayPlanning = planningData.filter(p => p.date === dateStr);
        
        dayColumn.innerHTML = `
            <div class="day-header">
                <div class="day-name">${dayNames[index]}</div>
                <div class="day-date">${date.getDate()}/${date.getMonth() + 1}</div>
            </div>
            <div class="meals">
                ${renderMealSlot(dayPlanning.find(p => p.moment === 'Déjeuner'), 'Midi')}
                ${renderMealSlot(dayPlanning.find(p => p.moment === 'Dîner'), 'Soir')}
            </div>
        `;
        
        grid.appendChild(dayColumn);
    });
    
    updateStats();
}

function renderMealSlot(meal, timeLabel) {
    if (meal && meal.recette) {
        const recipe = recipes.find(r => r.id === meal.recette);
        if (recipe) {
            return `
                <div class="meal-slot">
                    <div class="meal-time">🍽️ ${timeLabel}</div>
                    <div class="meal-name">${recipe.nom || 'Sans nom'}</div>
                    <div class="meal-info">
                        <span class="meal-calories">${Math.round(recipe.calories_totales || 0)} kcal</span>
                        <span>${Math.round(recipe.proteines_g || 0)}g prot</span>
                    </div>
                </div>
            `;
        }
    }
    
    return `
        <div class="meal-slot empty-slot">
            <div class="meal-time">${timeLabel}</div>
            <div>Aucun repas</div>
        </div>
    `;
}

function updateStats() {
    const weekDates = getWeekDates(currentWeek, currentYear);
    let totalCalories = 0;
    let totalProteins = 0;
    let mealCount = 0;
    
    weekDates.forEach(date => {
        const dateStr = date.toISOString().split('T')[0];
        const dayMeals = planningData.filter(p => p.date === dateStr);
        
        dayMeals.forEach(meal => {
            if (meal.recette) {
                const recipe = recipes.find(r => r.id === meal.recette);
                if (recipe) {
                    totalCalories += recipe.calories_totales || 0;
                    totalProteins += recipe.proteines_g || 0;
                    mealCount++;
                }
            }
        });
    });
    
    const avgCalories = mealCount > 0 ? Math.round(totalCalories / 7) : 0;
    const avgProteins = mealCount > 0 ? Math.round(totalProteins / 7) : 0;
    
    document.getElementById('avgCalories').textContent = avgCalories;
    document.getElementById('avgProteins').textContent = avgProteins;
    document.getElementById('plannedMeals').textContent = mealCount;
}

// API Airtable
async function loadRecipes() {
    if (!config.airtable.token) return;
    
    try {
        const response = await fetch(
            `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.tableId}`,
            {
                headers: {
                    'Authorization': `Bearer ${config.airtable.token}`
                }
            }
        );
        
        if (response.ok) {
            const data = await response.json();
            recipes = data.records.map(record => ({
                id: record.id,
                ...record.fields
            }));
            renderPlanningGrid(); // Re-render avec les recettes chargées
        } else {
            console.error('Erreur chargement recettes:', response.status);
            addBotMessage("❌ Erreur lors du chargement des recettes.");
        }
    } catch (error) {
        console.error('Erreur:', error);
        addBotMessage("❌ Impossible de se connecter à Airtable.");
    }
}

async function loadWeekPlanning() {
    if (!config.airtable.token || !config.airtable.planningTableId) {
        // Pour l'instant on utilise des données de test
        planningData = generateTestPlanning();
        renderPlanningGrid();
        return;
    }
    
    try {
        const weekDates = getWeekDates(currentWeek, currentYear);
        const startDate = weekDates[0].toISOString().split('T')[0];
        const endDate = weekDates[6].toISOString().split('T')[0];
        
        const formula = `AND({date} >= '${startDate}', {date} <= '${endDate}')`;
        const response = await fetch(
            `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.planningTableId}?filterByFormula=${encodeURIComponent(formula)}`,
            {
                headers: {
                    'Authorization': `Bearer ${config.airtable.token}`
                }
            }
        );
        
        if (response.ok) {
            const data = await response.json();
            planningData = data.records.map(record => ({
                id: record.id,
                ...record.fields
            }));
            renderPlanningGrid();
        }
    } catch (error) {
        console.error('Erreur planning:', error);
    }
}

// Données de test (à remplacer par les vraies données Airtable)
function generateTestPlanning() {
    const weekDates = getWeekDates(currentWeek, currentYear);
    const testPlanning = [];
    
    // Ajouter quelques repas de test
    if (currentWeek === getWeekNumber(new Date())) {
        testPlanning.push({
            date: weekDates[0].toISOString().split('T')[0],
            moment: 'Déjeuner',
            recette: recipes[0]?.id
        });
        testPlanning.push({
            date: weekDates[1].toISOString().split('T')[0],
            moment: 'Dîner',
            recette: recipes[0]?.id
        });
    }
    
    return testPlanning;
}

// Chat Telegram
function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Ajouter le message utilisateur
    addUserMessage(message);
    input.value = '';
    
    // Envoyer au bot Telegram
    sendToTelegram(message);
}

function addUserMessage(text) {
    addMessage(text, 'user');
}

function addBotMessage(text) {
    addMessage(text, 'bot');
}

function addMessage(text, sender) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const time = new Date().toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    messageDiv.innerHTML = `
        <div class="message-bubble">${text}</div>
        <span class="message-time">${time}</span>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


async function sendToTelegram(message) {
    if (!config.telegram.botToken || !config.telegram.chatId) {
        addBotMessage("⚠️ Configuration Telegram manquante. Veuillez configurer le bot.");
        return;
    }
    
    try {
        // CHANGEMENT ICI : Envoyer au webhook n8n au lieu de Telegram directement
        const response = await fetch(
            'https://TON-N8N.com/webhook/meal-planner', // 👈 Remplace par ton URL webhook
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: message,
                    chat_id: config.telegram.chatId
                })
            }
        );
        
        if (!response.ok) {
            addBotMessage("❌ Erreur lors de l'envoi du message.");
        }
        // La réponse sera récupérée par le polling getUpdates
    } catch (error) {
        console.error('Erreur n8n:', error);
        addBotMessage("❌ Impossible de contacter le serveur.");
    }
}

// Configuration Modal
function openConfig() {
    document.getElementById('configModal').style.display = 'block';
    
    // Pré-remplir avec les valeurs sauvegardées
    document.getElementById('airtableToken').value = config.airtable.token;
    document.getElementById('telegramChatId').value = config.telegram.chatId;
    document.getElementById('telegramToken').value = config.telegram.botToken;
}

function closeConfig() {
    document.getElementById('configModal').style.display = 'none';
}

function saveConfig() {
    const airtableToken = document.getElementById('airtableToken').value;
    const telegramChatId = document.getElementById('telegramChatId').value;
    const telegramToken = document.getElementById('telegramToken').value;
    
    // Sauvegarder dans localStorage
    localStorage.setItem('airtableToken', airtableToken);
    localStorage.setItem('telegramChatId', telegramChatId);
    localStorage.setItem('telegramToken', telegramToken);
    
    // Mettre à jour la configuration
    config.airtable.token = airtableToken;
    config.telegram.chatId = telegramChatId;
    config.telegram.botToken = telegramToken;
    
    // Recharger les données
    loadRecipes();
    loadWeekPlanning();
    
    // Démarrer le polling si pas déjà actif
    if (!pollingInterval && config.telegram.botToken && config.telegram.chatId) {
        startTelegramPolling();
    }
    
    addBotMessage("✅ Configuration sauvegardée avec succès!");
    closeConfig();
}

// Fermer le modal si on clique en dehors
window.onclick = function(event) {
    const modal = document.getElementById('configModal');
    if (event.target === modal) {
        closeConfig();
    }
}
