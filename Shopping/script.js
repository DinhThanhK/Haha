// Firebase Configuration
const FIREBASE_URL = 'https://mylife-ddd6a-default-rtdb.firebaseio.com/priceTracker.json';

// State
let items = [];
let foodTags = ['Cơm', 'Phở', 'Bún', 'Bánh mì', 'Trà sữa', 'Cà phê'];
let locationTags = [
    { name: 'Siêu thị', color: '#10b981' },
    { name: 'Chợ', color: '#f59e0b' },
    { name: 'Cửa hàng tiện lợi', color: '#3b82f6' },
    { name: 'Quán ăn', color: '#ef4444' }
];
let selectedDate = new Date();
let searchQuery = '';
let sortBy = 'date';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadFromFirebase();
    setupEventListeners();
    updateDateDisplay();
    renderFoodTags();
    renderLocationTags();
});

// Firebase Functions
async function loadFromFirebase() {
    try {
        const response = await fetch(FIREBASE_URL);
        const data = await response.json();
        if (data) {
            items = data.items || [];
            foodTags = data.foodTags || foodTags;
            locationTags = data.locationTags || locationTags;
            renderFoodTags();
            renderLocationTags();
            renderResults();
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

async function saveToFirebase() {
    try {
        await fetch(FIREBASE_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items, foodTags, locationTags })
        });
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Event Listeners
function setupEventListeners() {
    document.getElementById('prevDay').addEventListener('click', () => changeDate(-1));
    document.getElementById('nextDay').addEventListener('click', () => changeDate(1));
    
    document.getElementById('datePicker').addEventListener('change', (e) => {
        selectedDate = new Date(e.target.value);
        updateDateDisplay();
    });
    
    document.getElementById('addBtn').addEventListener('click', addItem);
    
    document.getElementById('addFoodTagBtn').addEventListener('click', () => {
        const form = document.getElementById('addFoodForm');
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    });
    
    document.getElementById('addLocationTagBtn').addEventListener('click', () => {
        const form = document.getElementById('addLocationForm');
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    });
    
    document.getElementById('saveFoodTagBtn').addEventListener('click', addFoodTag);
    document.getElementById('saveLocationTagBtn').addEventListener('click', addLocationTag);
    
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchQuery = e.target.value;
        updateSortButtons();
        
        if (searchQuery.trim()) {
            showSearchOverlay();
        } else {
            hideSearchOverlay();
            renderResults();
        }
    });
    
    document.getElementById('sortDate').addEventListener('click', () => {
        sortBy = 'date';
        updateSortButtons();
        renderResults();
    });
    
    document.getElementById('sortPrice').addEventListener('click', () => {
        sortBy = 'price';
        updateSortButtons();
        renderResults();
    });
    
    // Click outside to close search overlay
    document.addEventListener('click', (e) => {
        const searchCard = document.querySelector('.card');
        if (!searchCard.contains(e.target) && searchQuery.trim()) {
            hideSearchOverlay();
        }
    });
}

// Date Functions
function changeDate(days) {
    selectedDate.setDate(selectedDate.getDate() + days);
    updateDateDisplay();
    updateDatePicker();
}

function updateDateDisplay() {
    document.getElementById('dateDisplay').value = selectedDate.toLocaleDateString('vi-VN');
    updateDatePicker();
}

function updateDatePicker() {
    document.getElementById('datePicker').value = selectedDate.toISOString().split('T')[0];
}

// Item Functions
function addItem() {
    const food = document.getElementById('foodSelect').value;
    const price = parseFloat(document.getElementById('priceInput').value);
    const location = document.getElementById('locationSelect').value;
    
    if (!food || !price || !location) {
        alert('Vui lòng điền đầy đủ thông tin');
        return;
    }
    
    const newItem = {
        id: Date.now(),
        food,
        price,
        location,
        date: selectedDate.toISOString().split('T')[0]
    };
    
    items.push(newItem);
    saveToFirebase();
    renderResults();
    
    // Reset form
    document.getElementById('foodSelect').value = '';
    document.getElementById('priceInput').value = '';
    document.getElementById('locationSelect').value = '';
    selectedDate = new Date();
    updateDateDisplay();
}

// Tag Functions
function addFoodTag() {
    const input = document.getElementById('newFoodTag');
    const tag = input.value.trim();
    
    if (tag && !foodTags.includes(tag)) {
        foodTags.push(tag);
        saveToFirebase();
        renderFoodTags();
        input.value = '';
        document.getElementById('addFoodForm').style.display = 'none';
    }
}

function addLocationTag() {
    const nameInput = document.getElementById('newLocationTag');
    const colorInput = document.getElementById('locationColor');
    const name = nameInput.value.trim();
    const color = colorInput.value;
    
    if (name && !locationTags.find(t => t.name === name)) {
        locationTags.push({ name, color });
        saveToFirebase();
        renderLocationTags();
        nameInput.value = '';
        colorInput.value = '#10b981';
        document.getElementById('addLocationForm').style.display = 'none';
    }
}

function renderFoodTags() {
    const container = document.getElementById('foodTagsList');
    const select = document.getElementById('foodSelect');
    
    container.innerHTML = foodTags.map(tag => 
        `<span class="tag" style="background: #667eea">${tag}</span>`
    ).join('');
    
    select.innerHTML = '<option value="">Chọn món</option>' + 
        foodTags.map(tag => `<option value="${tag}">${tag}</option>`).join('');
}

function renderLocationTags() {
    const container = document.getElementById('locationTagsList');
    const select = document.getElementById('locationSelect');
    
    container.innerHTML = locationTags.map(tag => 
        `<span class="tag" style="background: ${tag.color}">${tag.name}</span>`
    ).join('');
    
    select.innerHTML = '<option value="">Chọn nơi mua</option>' + 
        locationTags.map(tag => 
            `<option value="${tag.name}" data-color="${tag.color}">${tag.name}</option>`
        ).join('');
}

// Results Functions
function getDaysSince(dateString) {
    const itemDate = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today - itemDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getProgressColor(days) {
    if (days < 5) return { color: '#22c55e', width: '100%' };
    if (days < 10) return { color: '#84cc16', width: '80%' };
    if (days < 15) return { color: '#eab308', width: '60%' };
    if (days < 20) return { color: '#f97316', width: '40%' };
    if (days < 25) return { color: '#ef4444', width: '25%' };
    if (days < 30) return { color: '#dc2626', width: '15%' };
    return { color: '#7f1d1d', width: '7%' };
}

function getLocationColor(locationName) {
    const location = locationTags.find(t => t.name === locationName);
    return location ? location.color : '#10b981';
}

function filterAndSortItems() {
    let filtered = items.filter(item => {
        const searchLower = searchQuery.toLowerCase();
        return (
            item.food.toLowerCase().includes(searchLower) ||
            item.location.toLowerCase().includes(searchLower) ||
            item.date.includes(searchQuery)
        );
    });
    
    if (searchQuery) {
        filtered.sort((a, b) => {
            if (a.price !== b.price) return a.price - b.price;
            return new Date(b.date) - new Date(a.date);
        });
    } else {
        if (sortBy === 'date') {
            filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        } else if (sortBy === 'price') {
            filtered.sort((a, b) => a.price - b.price);
        }
    }
    
    return filtered;
}

function createItemHTML(item) {
    const daysSince = getDaysSince(item.date);
    const { color, width } = getProgressColor(daysSince);
    const locationColor = getLocationColor(item.location);
    
    return `
        <div class="item-card">
            <div class="item-content">
                <div class="item-info">
                    <div class="item-title">${item.food}</div>
                    <span class="item-location" style="background: ${locationColor}">${item.location}</span>
                </div>
                <div class="item-right">
                    <div class="item-price">${item.price}K</div>
                    <div class="item-meta">
                        <div class="item-date">${item.date}</div>
                        <div class="item-days">${daysSince} ngày trước</div>
                    </div>
                </div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="background: ${color}; width: ${width}"></div>
            </div>
        </div>
    `;
}

function showSearchOverlay() {
    const overlay = document.getElementById('searchOverlay');
    const resultsContainer = document.getElementById('searchResults');
    const filtered = filterAndSortItems();
    
    if (filtered.length === 0) {
        resultsContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">Không tìm thấy kết quả</div>';
    } else {
        resultsContainer.innerHTML = filtered.map(item => createItemHTML(item)).join('');
    }
    
    overlay.style.display = 'block';
}

function hideSearchOverlay() {
    document.getElementById('searchOverlay').style.display = 'none';
}

function renderResults() {
    const container = document.getElementById('results');
    const filtered = filterAndSortItems();
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="card empty-state">Chưa có dữ liệu nào</div>';
        return;
    }
    
    container.innerHTML = filtered.map(item => createItemHTML(item)).join('');
}

function updateSortButtons() {
    const sortButtons = document.getElementById('sortButtons');
    if (searchQuery) {
        sortButtons.style.display = 'none';
    } else {
        sortButtons.style.display = 'flex';
        document.getElementById('sortDate').classList.toggle('active', sortBy === 'date');
        document.getElementById('sortPrice').classList.toggle('active', sortBy === 'price');
    }
}