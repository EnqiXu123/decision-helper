const APP_VERSION = 1;
const STORAGE_KEY = "decision-helper.v1.state";
const AUTOSAVE_DELAY_MS = 150;

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 20;
const MIN_CRITERIA = 1;
const MAX_CRITERIA = 20;
const MAX_TITLE_LENGTH = 80;
const MAX_OPTION_NAME_LENGTH = 60;
const MAX_CRITERION_NAME_LENGTH = 40;
const MAX_NOTE_LENGTH = 500;

const WEIGHT_LABELS = {
    1: "Meh",
    2: "Slight",
    3: "Medium",
    4: "Important",
    5: "Dealbreaker"
};

const DEFAULT_OPTIONS = ["Option A", "Option B"];
const DEFAULT_CRITERIA = [
    { name: "Price", weight: 4 },
    { name: "Quality", weight: 5 },
    { name: "Convenience", weight: 3 }
];

const dom = {};
let state = createDefaultState();
let saveTimer = null;
let lastWinnerAnnouncement = "";

const fieldErrors = {
    options: {},
    criteria: {},
    section: {
        options: "",
        criteria: ""
    }
};

document.addEventListener("DOMContentLoaded", init);

function init() {
    cacheDom();
    state = loadInitialState();
    bindStaticEvents();
    renderAll(true);
}

function cacheDom() {
    dom.titleInput = document.getElementById("decision-title");
    dom.resetBtn = document.getElementById("reset-btn");
    dom.statusBanner = document.getElementById("status-banner");
    dom.optionsList = document.getElementById("options-list");
    dom.optionsSectionError = document.getElementById("options-section-error");
    dom.criteriaList = document.getElementById("criteria-list");
    dom.criteriaSectionError = document.getElementById("criteria-section-error");
    dom.addOptionBtn = document.getElementById("add-option-btn");
    dom.addCriterionBtn = document.getElementById("add-criterion-btn");
    dom.ratingsTable = document.getElementById("ratings-table");
    dom.scoreSummary = document.getElementById("score-summary");
    dom.winnerCard = document.getElementById("winner-card");
    dom.rankingList = document.getElementById("ranking-list");
    dom.reasonsList = document.getElementById("reasons-list");
    dom.liveRegion = document.getElementById("live-region");
}

function bindStaticEvents() {
    dom.titleInput.addEventListener("input", handleTitleInput);
    dom.titleInput.addEventListener("change", handleTitleChange);
    dom.resetBtn.addEventListener("click", handleReset);
    dom.addOptionBtn.addEventListener("click", handleAddOption);
    dom.addCriterionBtn.addEventListener("click", handleAddCriterion);

    dom.optionsList.addEventListener("click", handleOptionClick);
    dom.optionsList.addEventListener("change", handleOptionChange);
    dom.optionsList.addEventListener("input", handleOptionInput);

    dom.criteriaList.addEventListener("click", handleCriterionClick);
    dom.criteriaList.addEventListener("change", handleCriterionChange);

    dom.ratingsTable.addEventListener("change", handleRatingChange);
    dom.ratingsTable.addEventListener("click", handleRatingClick);
    dom.ratingsTable.addEventListener("keydown", handleRatingKeydown);
}

function createDefaultState() {
    const now = Date.now();
    const options = DEFAULT_OPTIONS.map((name, index) =>
        createOption(name, now + index)
    );
    const criteria = DEFAULT_CRITERIA.map((criterion, index) =>
        createCriterion(criterion.name, criterion.weight, now + 100 + index)
    );

    return {
        version: APP_VERSION,
        title: "",
        options,
        criteria,
        ratings: {},
        updatedAt: now
    };
}

function createOption(name, createdAt = Date.now()) {
    return {
        id: createId(),
        name: name.slice(0, MAX_OPTION_NAME_LENGTH),
        note: "",
        createdAt
    };
}

function createCriterion(name, weight = 3, createdAt = Date.now()) {
    return {
        id: createId(),
        name: name.slice(0, MAX_CRITERION_NAME_LENGTH),
        weight: clampInt(weight, 1, 5),
        createdAt
    };
}

function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }

    const randomPart = Math.random().toString(36).slice(2, 10);
    return `id-${Date.now()}-${randomPart}`;
}

function loadInitialState() {
    let raw = null;
    try {
        raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        setStatus("Local storage is unavailable. Your changes may not persist.", "warning");
        return createDefaultState();
    }

    if (!raw) {
        return createDefaultState();
    }

    let parsed = null;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        setStatus("Saved data was corrupted and has been reset.", "warning");
        return createDefaultState();
    }

    if (!parsed || typeof parsed !== "object") {
        setStatus("Saved data was invalid and has been reset.", "warning");
        return createDefaultState();
    }

    if (parsed.version !== APP_VERSION) {
        const migrated = migrateState(parsed);
        if (migrated) {
            setStatus("Saved data was migrated to the latest format.", "info");
            return migrated;
        }
        setStatus("Saved data used an unsupported format and was reset.", "warning");
        return createDefaultState();
    }

    const sanitized = sanitizeV1State(parsed);
    if (!sanitized) {
        setStatus("Saved data could not be repaired and was reset.", "warning");
        return createDefaultState();
    }
    if (sanitized.repaired) {
        setStatus("Some saved data was repaired during load.", "info");
    }
    return sanitized.state;
}

function migrateState(parsed) {
    void parsed;
    return null;
}

function sanitizeV1State(candidate) {
    if (!candidate || typeof candidate !== "object") {
        return null;
    }

    let repaired = false;
    const titleSource = typeof candidate.title === "string" ? candidate.title : "";
    const title = titleSource.slice(0, MAX_TITLE_LENGTH);
    if (title !== titleSource) {
        repaired = true;
    }

    const optionResult = sanitizeOptions(candidate.options);
    const criterionResult = sanitizeCriteria(candidate.criteria);
    if (!optionResult || !criterionResult) {
        return null;
    }
    repaired = repaired || optionResult.repaired || criterionResult.repaired;

    const optionIds = new Set(optionResult.items.map((item) => item.id));
    const criterionIds = new Set(criterionResult.items.map((item) => item.id));
    const ratingsResult = sanitizeRatings(candidate.ratings, optionIds, criterionIds);
    repaired = repaired || ratingsResult.repaired;

    const updatedAt = Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : Date.now();
    if (!Number.isFinite(candidate.updatedAt)) {
        repaired = true;
    }

    return {
        repaired,
        state: {
            version: APP_VERSION,
            title,
            options: optionResult.items,
            criteria: criterionResult.items,
            ratings: ratingsResult.items,
            updatedAt
        }
    };
}

function sanitizeOptions(input) {
    let repaired = false;
    const source = Array.isArray(input) ? input : [];
    if (!Array.isArray(input)) {
        repaired = true;
    }

    const items = [];
    const usedNames = new Set();
    let ordinal = 1;

    for (const item of source) {
        if (items.length >= MAX_OPTIONS) {
            repaired = true;
            break;
        }
        if (!item || typeof item !== "object") {
            repaired = true;
            continue;
        }

        const rawName = typeof item.name === "string" ? item.name.trim() : "";
        const cleanedName = rawName.slice(0, MAX_OPTION_NAME_LENGTH);
        if (!rawName || cleanedName !== rawName) {
            repaired = true;
        }

        const name = uniqueName(cleanedName, usedNames, "Option", MAX_OPTION_NAME_LENGTH, ordinal);
        if (name !== cleanedName) {
            repaired = true;
        }

        const note = typeof item.note === "string" ? item.note.slice(0, MAX_NOTE_LENGTH) : "";
        if (typeof item.note !== "string" || note !== item.note) {
            repaired = true;
        }

        const id = typeof item.id === "string" && item.id ? item.id : createId();
        if (id !== item.id) {
            repaired = true;
        }

        const createdAt = Number.isFinite(item.createdAt) ? item.createdAt : Date.now() + items.length;
        if (!Number.isFinite(item.createdAt)) {
            repaired = true;
        }

        items.push({
            id,
            name,
            note,
            createdAt
        });
        ordinal += 1;
    }

    while (items.length < MIN_OPTIONS) {
        const fallbackName = uniqueName("", usedNames, "Option", MAX_OPTION_NAME_LENGTH, ordinal);
        items.push(createOption(fallbackName, Date.now() + ordinal));
        repaired = true;
        ordinal += 1;
    }

    return {
        repaired,
        items
    };
}

function sanitizeCriteria(input) {
    let repaired = false;
    const source = Array.isArray(input) ? input : [];
    if (!Array.isArray(input)) {
        repaired = true;
    }

    const items = [];
    const usedNames = new Set();
    let ordinal = 1;

    for (const item of source) {
        if (items.length >= MAX_CRITERIA) {
            repaired = true;
            break;
        }
        if (!item || typeof item !== "object") {
            repaired = true;
            continue;
        }

        const rawName = typeof item.name === "string" ? item.name.trim() : "";
        const cleanedName = rawName.slice(0, MAX_CRITERION_NAME_LENGTH);
        if (!rawName || cleanedName !== rawName) {
            repaired = true;
        }

        const name = uniqueName(cleanedName, usedNames, "Criterion", MAX_CRITERION_NAME_LENGTH, ordinal);
        if (name !== cleanedName) {
            repaired = true;
        }

        const weight = clampInt(item.weight, 1, 5);
        if (weight !== item.weight) {
            repaired = true;
        }

        const id = typeof item.id === "string" && item.id ? item.id : createId();
        if (id !== item.id) {
            repaired = true;
        }

        const createdAt = Number.isFinite(item.createdAt) ? item.createdAt : Date.now() + items.length;
        if (!Number.isFinite(item.createdAt)) {
            repaired = true;
        }

        items.push({
            id,
            name,
            weight,
            createdAt
        });
        ordinal += 1;
    }

    while (items.length < MIN_CRITERIA) {
        const fallbackName = uniqueName("", usedNames, "Criterion", MAX_CRITERION_NAME_LENGTH, ordinal);
        items.push(createCriterion(fallbackName, 3, Date.now() + ordinal));
        repaired = true;
        ordinal += 1;
    }

    return {
        repaired,
        items
    };
}

function sanitizeRatings(input, optionIds, criterionIds) {
    let repaired = false;
    const items = {};
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
            repaired: true,
            items
        };
    }

    for (const [key, value] of Object.entries(input)) {
        const [optionId, criterionId] = key.split(":");
        if (!optionIds.has(optionId) || !criterionIds.has(criterionId)) {
            repaired = true;
            continue;
        }

        if (value === null) {
            repaired = true;
            continue;
        }
        if (!Number.isInteger(value) || value < 1 || value > 5) {
            repaired = true;
            continue;
        }
        items[key] = value;
    }

    return {
        repaired,
        items
    };
}

function uniqueName(rawName, usedNames, prefix, maxLength, ordinal) {
    let base = rawName && rawName.trim() ? rawName.trim() : `${prefix} ${ordinal}`;
    base = base.slice(0, maxLength);
    let candidate = base;
    let suffixIndex = 2;

    while (usedNames.has(candidate.toLocaleLowerCase())) {
        const suffix = ` (${suffixIndex})`;
        candidate = `${base.slice(0, maxLength - suffix.length)}${suffix}`.trim();
        suffixIndex += 1;
    }

    usedNames.add(candidate.toLocaleLowerCase());
    return candidate;
}

function handleTitleInput(event) {
    const trimmedLength = event.target.value.slice(0, MAX_TITLE_LENGTH);
    if (trimmedLength !== event.target.value) {
        event.target.value = trimmedLength;
    }
    state.title = trimmedLength;
    registerMutation("none");
}

function handleTitleChange(event) {
    const normalized = event.target.value.trim().slice(0, MAX_TITLE_LENGTH);
    state.title = normalized;
    dom.titleInput.value = normalized;
    registerMutation("none");
}

function handleReset() {
    const shouldReset = window.confirm("Reset this decision and clear saved data?");
    if (!shouldReset) {
        return;
    }

    if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
        saveTimer = null;
    }

    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        setStatus("Could not clear saved data. Continuing with a fresh in-memory state.", "warning");
    }

    clearAllErrors();
    state = createDefaultState();
    lastWinnerAnnouncement = "";
    setStatus("Decision reset to default state.", "info");
    announceLive("Decision reset to default state.");
    renderAll(true);
}

function handleAddOption() {
    if (state.options.length >= MAX_OPTIONS) {
        setSectionError("options", "You can add up to 20 options.");
        announceLive("You can add up to 20 options.");
        return;
    }

    const newName = nextOptionName();
    state.options.push(createOption(newName, Date.now()));
    setSectionError("options", "");
    registerMutation("all");
}

function handleAddCriterion() {
    if (state.criteria.length >= MAX_CRITERIA) {
        setSectionError("criteria", "You can add up to 20 criteria.");
        announceLive("You can add up to 20 criteria.");
        return;
    }

    const newName = nextCriterionName();
    state.criteria.push(createCriterion(newName, 3, Date.now()));
    setSectionError("criteria", "");
    registerMutation("all");
}

function handleOptionClick(event) {
    const button = event.target.closest("button[data-action='delete-option']");
    if (!button) {
        return;
    }

    const optionId = button.dataset.optionId;
    if (!optionId) {
        return;
    }
    deleteOption(optionId);
}

function handleOptionChange(event) {
    const input = event.target;
    const optionId = input.dataset.optionId;
    if (!optionId) {
        return;
    }

    if (input.dataset.field === "option-name") {
        updateOptionName(optionId, input.value);
    }
}

function handleOptionInput(event) {
    const input = event.target;
    const optionId = input.dataset.optionId;
    if (!optionId) {
        return;
    }

    if (input.dataset.field === "option-note") {
        const option = findOption(optionId);
        if (!option) {
            return;
        }
        option.note = input.value.slice(0, MAX_NOTE_LENGTH);
        const counter = dom.optionsList.querySelector(`[data-note-counter='${optionId}']`);
        if (counter) {
            counter.textContent = `${option.note.length}/${MAX_NOTE_LENGTH}`;
        }
        registerMutation("none");
    }
}

function handleCriterionClick(event) {
    const button = event.target.closest("button[data-action='delete-criterion']");
    if (!button) {
        return;
    }

    const criterionId = button.dataset.criterionId;
    if (!criterionId) {
        return;
    }
    deleteCriterion(criterionId);
}

function handleCriterionChange(event) {
    const input = event.target;
    const criterionId = input.dataset.criterionId;
    if (!criterionId) {
        return;
    }

    if (input.dataset.field === "criterion-name") {
        updateCriterionName(criterionId, input.value);
        return;
    }

    if (input.dataset.field === "criterion-weight") {
        const criterion = findCriterion(criterionId);
        if (!criterion) {
            return;
        }
        criterion.weight = clampInt(input.value, 1, 5);
        clearCriterionError(criterionId);
        registerMutation("all");
    }
}

function handleRatingChange(event) {
    const input = event.target;
    if (input.dataset.role !== "rating-input") {
        return;
    }

    const optionId = input.dataset.optionId;
    const criterionId = input.dataset.criterionId;
    if (!optionId || !criterionId) {
        return;
    }
    const value = clampInt(input.value, 1, 5);
    setRating(optionId, criterionId, value);
}

function handleRatingClick(event) {
    const button = event.target.closest("button[data-action='clear-rating']");
    if (!button) {
        return;
    }

    const optionId = button.dataset.optionId;
    const criterionId = button.dataset.criterionId;
    if (!optionId || !criterionId) {
        return;
    }
    clearRating(optionId, criterionId);
    clearRatingInDom(optionId, criterionId);
    renderResults();
    registerMutation("none");
}

function handleRatingKeydown(event) {
    const input = event.target;
    if (input.dataset.role !== "rating-input") {
        return;
    }
    if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
    }

    const optionId = input.dataset.optionId;
    const criterionId = input.dataset.criterionId;
    if (!optionId || !criterionId) {
        return;
    }

    event.preventDefault();
    clearRating(optionId, criterionId);
    clearRatingInDom(optionId, criterionId);
    renderResults();
    registerMutation("none");
}

function updateOptionName(optionId, rawName) {
    const option = findOption(optionId);
    if (!option) {
        return;
    }

    const normalized = rawName.trim();
    const error = validateOptionName(normalized, optionId);
    if (error) {
        setOptionError(optionId, error);
        announceLive(error);
        renderOptions();
        return;
    }

    option.name = normalized;
    clearOptionError(optionId);
    registerMutation("all");
}

function updateCriterionName(criterionId, rawName) {
    const criterion = findCriterion(criterionId);
    if (!criterion) {
        return;
    }

    const normalized = rawName.trim();
    const error = validateCriterionName(normalized, criterionId);
    if (error) {
        setCriterionError(criterionId, error);
        announceLive(error);
        renderCriteria();
        return;
    }

    criterion.name = normalized;
    clearCriterionError(criterionId);
    registerMutation("all");
}

function deleteOption(optionId) {
    if (state.options.length <= MIN_OPTIONS) {
        const message = "At least 2 options required.";
        setSectionError("options", message);
        announceLive(message);
        return;
    }

    state.options = state.options.filter((option) => option.id !== optionId);
    pruneRatingsByOption(optionId);
    clearOptionError(optionId);
    setSectionError("options", "");
    registerMutation("all");
}

function deleteCriterion(criterionId) {
    if (state.criteria.length <= MIN_CRITERIA) {
        const message = "At least 1 criterion required.";
        setSectionError("criteria", message);
        announceLive(message);
        return;
    }

    state.criteria = state.criteria.filter((criterion) => criterion.id !== criterionId);
    pruneRatingsByCriterion(criterionId);
    clearCriterionError(criterionId);
    setSectionError("criteria", "");
    registerMutation("all");
}

function setRating(optionId, criterionId, value) {
    if (!findOption(optionId) || !findCriterion(criterionId)) {
        return;
    }

    state.ratings[ratingKey(optionId, criterionId)] = value;
    setRatingVisualInDom(optionId, criterionId, value);
    renderResults();
    registerMutation("none");
}

function clearRating(optionId, criterionId) {
    delete state.ratings[ratingKey(optionId, criterionId)];
}

function clearRatingInDom(optionId, criterionId) {
    setRatingVisualInDom(optionId, criterionId, 0);
}

function setRatingVisualInDom(optionId, criterionId, selectedValue) {
    const selector = `input[data-role='rating-input'][data-option-id='${cssEscape(optionId)}'][data-criterion-id='${cssEscape(criterionId)}']`;
    const inputs = dom.ratingsTable.querySelectorAll(selector);
    for (const input of inputs) {
        const value = Number.parseInt(input.value, 10);
        const isChecked = selectedValue > 0 && value === selectedValue;
        const isFilled = selectedValue > 0 && value <= selectedValue;
        input.checked = isChecked;
        const star = input.nextElementSibling;
        if (star) {
            star.classList.toggle("is-active", isFilled);
        }
    }
}

function pruneRatingsByOption(optionId) {
    const prefix = `${optionId}:`;
    for (const key of Object.keys(state.ratings)) {
        if (key.startsWith(prefix)) {
            delete state.ratings[key];
        }
    }
}

function pruneRatingsByCriterion(criterionId) {
    const suffix = `:${criterionId}`;
    for (const key of Object.keys(state.ratings)) {
        if (key.endsWith(suffix)) {
            delete state.ratings[key];
        }
    }
}

function validateOptionName(name, optionId) {
    if (!name) {
        return "Option name is required.";
    }
    if (name.length > MAX_OPTION_NAME_LENGTH) {
        return "Option name must be 60 characters or fewer.";
    }

    const normalized = name.toLocaleLowerCase();
    for (const option of state.options) {
        if (option.id === optionId) {
            continue;
        }
        if (option.name.trim().toLocaleLowerCase() === normalized) {
            return "Option names must be unique.";
        }
    }
    return "";
}

function validateCriterionName(name, criterionId) {
    if (!name) {
        return "Criterion name is required.";
    }
    if (name.length > MAX_CRITERION_NAME_LENGTH) {
        return "Criterion name must be 40 characters or fewer.";
    }

    const normalized = name.toLocaleLowerCase();
    for (const criterion of state.criteria) {
        if (criterion.id === criterionId) {
            continue;
        }
        if (criterion.name.trim().toLocaleLowerCase() === normalized) {
            return "Criterion names must be unique.";
        }
    }
    return "";
}

function findOption(optionId) {
    return state.options.find((option) => option.id === optionId);
}

function findCriterion(criterionId) {
    return state.criteria.find((criterion) => criterion.id === criterionId);
}

function nextOptionName() {
    const existing = new Set(state.options.map((item) => item.name.trim().toLocaleLowerCase()));
    for (let i = 1; i <= 999; i += 1) {
        const candidate = `Option ${i}`;
        if (!existing.has(candidate.toLocaleLowerCase())) {
            return candidate;
        }
    }
    return `Option ${Date.now()}`;
}

function nextCriterionName() {
    const existing = new Set(state.criteria.map((item) => item.name.trim().toLocaleLowerCase()));
    for (let i = 1; i <= 999; i += 1) {
        const candidate = `Criterion ${i}`;
        if (!existing.has(candidate.toLocaleLowerCase())) {
            return candidate;
        }
    }
    return `Criterion ${Date.now()}`;
}

function renderAll(skipWinnerAnnouncement = false) {
    renderTitle();
    renderOptions();
    renderCriteria();
    renderRatings();
    renderResults(skipWinnerAnnouncement);
    renderSectionErrors();
}

function renderTitle() {
    dom.titleInput.value = state.title;
}

function renderOptions() {
    dom.optionsList.innerHTML = state.options
        .map((option, index) => {
            const nameId = `option-name-${option.id}`;
            const noteId = `option-note-${option.id}`;
            const errorText = fieldErrors.options[option.id] || "";
            const invalidFlag = errorText ? "true" : "false";

            return `
                <article class="item-card" data-option-id="${escapeHtml(option.id)}">
                    <div class="item-card-head">
                        <label for="${nameId}">Option ${index + 1}</label>
                        <button type="button" class="btn btn-danger" data-action="delete-option"
                            data-option-id="${escapeHtml(option.id)}">Delete</button>
                    </div>
                    <div class="item-grid">
                        <input id="${nameId}" data-field="option-name" data-option-id="${escapeHtml(option.id)}"
                            type="text" maxlength="${MAX_OPTION_NAME_LENGTH}" value="${escapeHtml(option.name)}"
                            aria-describedby="option-error-${escapeHtml(option.id)}" aria-invalid="${invalidFlag}">
                        <p class="inline-error" id="option-error-${escapeHtml(option.id)}">${escapeHtml(errorText)}</p>
                        <label for="${noteId}">Notes (optional)</label>
                        <textarea id="${noteId}" data-field="option-note" data-option-id="${escapeHtml(option.id)}"
                            maxlength="${MAX_NOTE_LENGTH}">${escapeHtml(option.note)}</textarea>
                        <p class="char-counter" data-note-counter="${escapeHtml(option.id)}">${option.note.length}/${MAX_NOTE_LENGTH}</p>
                    </div>
                </article>
            `;
        })
        .join("");
}

function renderCriteria() {
    dom.criteriaList.innerHTML = state.criteria
        .map((criterion, index) => {
            const nameId = `criterion-name-${criterion.id}`;
            const weightId = `criterion-weight-${criterion.id}`;
            const errorText = fieldErrors.criteria[criterion.id] || "";
            const invalidFlag = errorText ? "true" : "false";

            return `
                <article class="item-card" data-criterion-id="${escapeHtml(criterion.id)}">
                    <div class="item-card-head">
                        <label for="${nameId}">Criterion ${index + 1}</label>
                        <button type="button" class="btn btn-danger" data-action="delete-criterion"
                            data-criterion-id="${escapeHtml(criterion.id)}">Delete</button>
                    </div>
                    <div class="criteria-row">
                        <input id="${nameId}" data-field="criterion-name" data-criterion-id="${escapeHtml(criterion.id)}"
                            type="text" maxlength="${MAX_CRITERION_NAME_LENGTH}" value="${escapeHtml(criterion.name)}"
                            aria-describedby="criterion-error-${escapeHtml(criterion.id)}" aria-invalid="${invalidFlag}">
                        <label for="${weightId}" class="sr-only">Weight for ${escapeHtml(criterion.name)}</label>
                        <select id="${weightId}" data-field="criterion-weight"
                            data-criterion-id="${escapeHtml(criterion.id)}">
                            ${renderWeightOptions(criterion.weight)}
                        </select>
                    </div>
                    <p class="inline-error" id="criterion-error-${escapeHtml(criterion.id)}">${escapeHtml(errorText)}</p>
                </article>
            `;
        })
        .join("");
}

function renderWeightOptions(selectedWeight) {
    const options = [];
    for (let value = 1; value <= 5; value += 1) {
        const selected = selectedWeight === value ? " selected" : "";
        options.push(`<option value="${value}"${selected}>${value} - ${WEIGHT_LABELS[value]}</option>`);
    }
    return options.join("");
}

function renderRatings() {
    if (!state.options.length || !state.criteria.length) {
        dom.ratingsTable.innerHTML = "";
        return;
    }

    const headCells = state.criteria
        .map(
            (criterion) => `
                <th scope="col">
                    <div class="criterion-head">
                        <span class="criterion-head-name">${escapeHtml(criterion.name)}</span>
                        <span class="criterion-head-weight">Weight ${criterion.weight} (${WEIGHT_LABELS[criterion.weight]})</span>
                    </div>
                </th>
            `
        )
        .join("");

    const rows = state.options
        .map((option) => {
            const cells = state.criteria
                .map((criterion) => {
                    const groupName = `rating-${option.id}-${criterion.id}`;
                    const selectedValue = readRating(option.id, criterion.id);
                    const label = `Rate ${option.name} on ${criterion.name}`;

                    const stars = [1, 2, 3, 4, 5]
                        .map((value) => {
                            const checked = selectedValue === value ? " checked" : "";
                            const filledClass = selectedValue >= value ? " is-active" : "";
                            return `
                                <label class="star-option">
                                    <input type="radio" data-role="rating-input"
                                        data-option-id="${escapeHtml(option.id)}"
                                        data-criterion-id="${escapeHtml(criterion.id)}"
                                        name="${escapeHtml(groupName)}" value="${value}"${checked}
                                        aria-label="${escapeHtml(`${value} stars for ${option.name} on ${criterion.name}`)}">
                                    <span class="${filledClass.trim()}" aria-hidden="true">★</span>
                                </label>
                            `;
                        })
                        .join("");

                    return `
                        <td>
                            <div class="rating-cell">
                                <div class="rating-stars" role="radiogroup" aria-label="${escapeHtml(label)}">
                                    ${stars}
                                </div>
                                <button type="button" class="clear-rating" data-action="clear-rating"
                                    data-option-id="${escapeHtml(option.id)}"
                                    data-criterion-id="${escapeHtml(criterion.id)}"
                                    aria-label="${escapeHtml(`Clear rating for ${option.name} on ${criterion.name}`)}">
                                    Clear
                                </button>
                            </div>
                        </td>
                    `;
                })
                .join("");

            return `
                <tr>
                    <th scope="row" class="option-header">${escapeHtml(option.name)}</th>
                    ${cells}
                </tr>
            `;
        })
        .join("");

    dom.ratingsTable.innerHTML = `
        <thead>
            <tr>
                <th scope="col" class="option-header">Option / Criterion</th>
                ${headCells}
            </tr>
        </thead>
        <tbody>
            ${rows}
        </tbody>
    `;
}

function renderResults(skipWinnerAnnouncement = false) {
    const metrics = computeMetrics();
    const winners = metrics.winners;
    const isZeroTie = metrics.ranking.length > 0 &&
        winners.length === metrics.ranking.length &&
        metrics.highestRaw === 0;

    dom.scoreSummary.textContent = `Max possible score per option: ${metrics.maxRaw} points`;

    if (winners.length === 1) {
        const winner = winners[0];
        dom.winnerCard.innerHTML = `
            <p class="winner-title">Winner: ${escapeHtml(winner.option.name)}</p>
            <p class="winner-meta">${winner.raw}/${metrics.maxRaw} points (${winner.pct.toFixed(1)}%)</p>
            <p class="winner-subtext">Top-ranked by weighted score.</p>
        `;
    } else {
        const winnerNames = winners.map((item) => item.option.name).join(", ");
        const message = isZeroTie
            ? "No ratings yet. All options are tied at 0."
            : `Co-winners: ${winnerNames}`;
        const score = winners[0] ? `${winners[0].raw}/${metrics.maxRaw}` : `0/${metrics.maxRaw}`;

        dom.winnerCard.innerHTML = `
            <p class="winner-title">${escapeHtml(message)}</p>
            <p class="winner-meta">Top score: ${escapeHtml(score)} points</p>
            <p class="winner-subtext">Shared winner policy is active for tied top scores.</p>
        `;
    }

    dom.rankingList.innerHTML = metrics.ranking
        .map(
            (item, index) => `
                <li class="rank-row">
                    <strong>${index + 1}. ${escapeHtml(item.option.name)}</strong>
                    <span class="rank-score"> - ${item.raw}/${metrics.maxRaw} (${item.pct.toFixed(1)}%)</span>
                </li>
            `
        )
        .join("");

    dom.reasonsList.innerHTML = winners
        .map((winner) => renderWinnerReasons(winner.option))
        .join("");

    if (!skipWinnerAnnouncement) {
        maybeAnnounceWinner(metrics, isZeroTie);
    }
}

function renderWinnerReasons(option) {
    const reasons = getTopReasons(option.id);
    if (!reasons.length) {
        return `
            <article class="reason-card">
                <h3>Top Reasons for ${escapeHtml(option.name)}</h3>
                <p class="winner-subtext">No contributing criteria yet. Add ratings.</p>
            </article>
        `;
    }

    const reasonItems = reasons
        .map(
            (reason) => `
                <li>
                    ${escapeHtml(reason.criterion.name)}: ${reason.points} points
                    (rating ${reason.rating} x weight ${reason.criterion.weight})
                </li>
            `
        )
        .join("");

    return `
        <article class="reason-card">
            <h3>Top Reasons for ${escapeHtml(option.name)}</h3>
            <ul>${reasonItems}</ul>
        </article>
    `;
}

function computeMetrics() {
    const optionIndex = new Map(state.options.map((option, index) => [option.id, index]));
    const maxRaw = state.criteria.reduce((sum, criterion) => sum + criterion.weight * 5, 0);
    const ranking = state.options
        .map((option) => {
            const raw = state.criteria.reduce((sum, criterion) => {
                const rating = readRating(option.id, criterion.id);
                return sum + rating * criterion.weight;
            }, 0);
            const pct = maxRaw > 0 ? (raw / maxRaw) * 100 : 0;
            return { option, raw, pct };
        })
        .sort((a, b) => {
            if (b.raw !== a.raw) {
                return b.raw - a.raw;
            }
            if (a.option.createdAt !== b.option.createdAt) {
                return a.option.createdAt - b.option.createdAt;
            }
            const aIndex = optionIndex.get(a.option.id) ?? Number.MAX_SAFE_INTEGER;
            const bIndex = optionIndex.get(b.option.id) ?? Number.MAX_SAFE_INTEGER;
            return aIndex - bIndex;
        });

    const highestRaw = ranking.length ? ranking[0].raw : 0;
    const winners = ranking.filter((item) => item.raw === highestRaw);

    return {
        maxRaw,
        ranking,
        winners,
        highestRaw
    };
}

function getTopReasons(optionId) {
    const criterionIndex = new Map(state.criteria.map((criterion, index) => [criterion.id, index]));
    return state.criteria
        .map((criterion) => {
            const rating = readRating(optionId, criterion.id);
            return {
                criterion,
                rating,
                points: rating * criterion.weight
            };
        })
        .filter((item) => item.points > 0)
        .sort((a, b) => {
            if (b.points !== a.points) {
                return b.points - a.points;
            }
            if (b.criterion.weight !== a.criterion.weight) {
                return b.criterion.weight - a.criterion.weight;
            }
            if (a.criterion.createdAt !== b.criterion.createdAt) {
                return a.criterion.createdAt - b.criterion.createdAt;
            }
            const aIndex = criterionIndex.get(a.criterion.id) ?? Number.MAX_SAFE_INTEGER;
            const bIndex = criterionIndex.get(b.criterion.id) ?? Number.MAX_SAFE_INTEGER;
            return aIndex - bIndex;
        })
        .slice(0, 3);
}

function maybeAnnounceWinner(metrics, isZeroTie) {
    if (!metrics.ranking.length) {
        return;
    }
    let announcement = "";
    if (isZeroTie) {
        announcement = "All options are tied at zero. Add ratings to break the tie.";
    } else if (metrics.winners.length === 1) {
        announcement = `Winner is ${metrics.winners[0].option.name}.`;
    } else {
        const names = metrics.winners.map((winner) => winner.option.name).join(", ");
        announcement = `Co-winners are ${names}.`;
    }

    if (announcement !== lastWinnerAnnouncement) {
        announceLive(announcement);
        lastWinnerAnnouncement = announcement;
    }
}

function readRating(optionId, criterionId) {
    const value = state.ratings[ratingKey(optionId, criterionId)];
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0;
}

function registerMutation(renderMode) {
    state.updatedAt = Date.now();
    if (renderMode === "all") {
        renderAll();
    } else if (renderMode === "results") {
        renderResults();
    }
    scheduleSave();
}

function scheduleSave() {
    if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
    }
    saveTimer = window.setTimeout(saveState, AUTOSAVE_DELAY_MS);
}

function saveState() {
    saveTimer = null;
    const payload = serializeState();
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        if (dom.statusBanner.classList.contains("warning")) {
            setStatus("Changes saved locally.", "info");
        }
    } catch (error) {
        setStatus("Could not save changes (storage may be full).", "warning");
    }
}

function serializeState() {
    return {
        version: APP_VERSION,
        title: state.title.trim().slice(0, MAX_TITLE_LENGTH),
        options: state.options.map((option) => ({
            id: option.id,
            name: option.name.trim().slice(0, MAX_OPTION_NAME_LENGTH),
            note: option.note.slice(0, MAX_NOTE_LENGTH),
            createdAt: option.createdAt
        })),
        criteria: state.criteria.map((criterion) => ({
            id: criterion.id,
            name: criterion.name.trim().slice(0, MAX_CRITERION_NAME_LENGTH),
            weight: clampInt(criterion.weight, 1, 5),
            createdAt: criterion.createdAt
        })),
        ratings: sanitizeRatings(
            state.ratings,
            new Set(state.options.map((option) => option.id)),
            new Set(state.criteria.map((criterion) => criterion.id))
        ).items,
        updatedAt: state.updatedAt
    };
}

function setStatus(message, type = "info") {
    dom.statusBanner.textContent = message;
    dom.statusBanner.classList.remove("warning");
    if (type === "warning" && message) {
        dom.statusBanner.classList.add("warning");
    }
}

function announceLive(message) {
    if (!message) {
        return;
    }
    dom.liveRegion.textContent = "";
    window.setTimeout(() => {
        dom.liveRegion.textContent = message;
    }, 10);
}

function setOptionError(optionId, message) {
    fieldErrors.options[optionId] = message;
}

function clearOptionError(optionId) {
    delete fieldErrors.options[optionId];
}

function setCriterionError(criterionId, message) {
    fieldErrors.criteria[criterionId] = message;
}

function clearCriterionError(criterionId) {
    delete fieldErrors.criteria[criterionId];
}

function setSectionError(section, message) {
    fieldErrors.section[section] = message;
    renderSectionErrors();
}

function renderSectionErrors() {
    dom.optionsSectionError.textContent = fieldErrors.section.options;
    dom.criteriaSectionError.textContent = fieldErrors.section.criteria;
}

function clearAllErrors() {
    fieldErrors.options = {};
    fieldErrors.criteria = {};
    fieldErrors.section.options = "";
    fieldErrors.section.criteria = "";
}

function ratingKey(optionId, criterionId) {
    return `${optionId}:${criterionId}`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
    }
    return String(value).replace(/['"\\]/g, "\\$&");
}

function clampInt(value, min, max) {
    const numberValue = Number.parseInt(value, 10);
    if (!Number.isFinite(numberValue)) {
        return min;
    }
    return Math.min(max, Math.max(min, numberValue));
}
