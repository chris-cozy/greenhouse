import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = (process.env.GREENHOUSE_URL || "http://localhost:4000").replace(/\/$/, "");
const here = path.dirname(fileURLToPath(import.meta.url));

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method || "GET"} ${route} failed (${response.status}): ${body}`);
  }
  return response.status === 204 ? undefined : response.json();
}

const put = (route, body) => request(route, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const post = (route, body) => request(route, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const ids = {
  species: {
    monstera: "demo-species-monstera",
    calathea: "demo-species-calathea",
    hearts: "demo-species-string-of-hearts",
    orchid: "demo-species-orchid",
    fittonia: "demo-species-fittonia",
    maidenhair: "demo-species-maidenhair",
    echeveria: "demo-species-echeveria",
    haworthia: "demo-species-haworthia",
    fern: "demo-species-boston-fern",
    maranta: "demo-species-maranta",
  },
  terrarium: {
    rainforest: "demo-terrarium-rainforest",
    desert: "demo-terrarium-desert",
    nursery: "demo-terrarium-nursery",
  },
  plant: {
    milo: "demo-plant-milo",
    opal: "demo-plant-opal",
    etta: "demo-plant-etta",
    june: "demo-plant-june",
    moss: "demo-plant-moss",
    pip: "demo-plant-pip",
    sage: "demo-plant-sage",
    stripe: "demo-plant-stripe",
    fernald: "demo-plant-fernald",
    oldGold: "demo-plant-old-gold",
    archive: "demo-plant-archive",
  },
};

const species = [
  [ids.species.monstera, {
    commonName: "Swiss cheese plant", scientificName: "Monstera deliciosa", family: "Araceae",
    description: "A climbing tropical aroid loved for broad leaves that develop dramatic fenestrations with age.",
    nativeHabitat: "Humid lowland rainforests of southern Mexico and Central America.",
    growthCharacteristics: "Climbing vine with aerial roots; new leaves emerge tightly rolled and harden over several days.",
    matureSize: "Indoors, commonly 6–10 ft tall with support.", lightRequirements: "Bright, indirect light; a little gentle morning sun is welcome.",
    waterRequirements: "Water thoroughly when the upper 2–3 in of mix feel dry.", humidityRequirements: "Comfortable above 45%; appreciates 55–70%.",
    temperatureRange: "65–85°F (18–29°C)", substratePreferences: "Chunky, airy aroid mix with bark, coir, perlite, and compost.",
    fertilizationRecommendations: "Half-strength balanced feed monthly through active growth.", propagationMethods: "Stem cutting with at least one node; air layering.",
    commonProblems: "Yellowing from prolonged wet soil; small unfenestrated leaves in low light.", commonPests: "Thrips, spider mites, scale.",
    toxicity: "Toxic if chewed; contains calcium oxalate crystals.", terrariumSuitability: "Only juvenile plants suit very large open terrariums.",
    notes: "A moss pole encourages larger, more mature foliage.",
  }],
  [ids.species.calathea, {
    commonName: "Round-leaf calathea", scientificName: "Goeppertia orbifolia", family: "Marantaceae",
    description: "A statement foliage plant with broad silver-striped leaves and a soft, architectural habit.",
    nativeHabitat: "Humid tropical understory in Bolivia.", growthCharacteristics: "Rhizomatous clump; leaves rise individually and turn gently toward light.",
    matureSize: "2–3 ft tall and wide.", lightRequirements: "Medium to bright filtered light; avoid harsh direct sun.",
    waterRequirements: "Keep evenly moist but never waterlogged; sensitive to mineral-heavy water.", humidityRequirements: "Prefers 60% or higher with steady airflow.",
    temperatureRange: "65–80°F (18–27°C)", substratePreferences: "Moisture-retentive but airy mix with coir, fine bark, and perlite.",
    fertilizationRecommendations: "Dilute balanced feed every 4–6 weeks in spring and summer.", propagationMethods: "Division during repotting.",
    commonProblems: "Crisp edges from dry air, salts, or inconsistent moisture.", commonPests: "Spider mites, fungus gnats.",
    toxicity: "Generally considered non-toxic to cats and dogs.", terrariumSuitability: "Young divisions can thrive in large humid displays.",
    notes: "Filtered rainwater keeps leaf margins looking their best.",
  }],
  [ids.species.hearts, {
    commonName: "String of hearts", scientificName: "Ceropegia woodii", family: "Apocynaceae",
    description: "A delicate trailing succulent vine with marbled heart-shaped leaves.", nativeHabitat: "Rocky slopes and forest margins of southern Africa.",
    growthCharacteristics: "Fast trailing vines with small aerial tubers and occasional lantern-shaped flowers.", matureSize: "Vines commonly reach 3–6 ft indoors.",
    lightRequirements: "Bright indirect light with a little mild direct sun.", waterRequirements: "Soak, then allow most of the mix to dry.",
    humidityRequirements: "Average household humidity; avoid stagnant, constantly damp conditions.", temperatureRange: "60–85°F (16–29°C)",
    substratePreferences: "Very free-draining cactus mix amended with pumice.", fertilizationRecommendations: "Light feed every 6 weeks during active growth.",
    propagationMethods: "Stem cuttings, butterfly cuttings, or aerial tubers.", commonProblems: "Sparse growth in low light; swollen leaves and rot from excess water.",
    commonPests: "Mealybugs, aphids.", toxicity: "Generally considered non-toxic.", terrariumSuitability: "Best in an open, dry display with excellent drainage.", notes: "Rotate monthly for an even curtain of vines.",
  }],
  [ids.species.orchid, {
    commonName: "Moth orchid", scientificName: "Phalaenopsis × hybrid", family: "Orchidaceae",
    description: "An epiphytic orchid with arching sprays of long-lasting flowers.", nativeHabitat: "Hybrids descend from warm, humid forests across Southeast Asia.",
    growthCharacteristics: "Slow-growing monopodial orchid; forms thick aerial roots and one or two leaves at a time.", matureSize: "12–24 in with flower spikes.",
    lightRequirements: "Bright, diffuse light; leaves should remain medium green.", waterRequirements: "Water bark when roots turn silvery, then drain completely.",
    humidityRequirements: "45–70% with air movement.", temperatureRange: "65–82°F (18–28°C); cooler nights can initiate spikes.",
    substratePreferences: "Coarse orchid bark or a ventilated mix of bark and sphagnum.", fertilizationRecommendations: "Weak orchid fertilizer every 2–4 waterings; flush monthly.",
    propagationMethods: "Keikis; division is uncommon for monopodial plants.", commonProblems: "Crown rot, wrinkled leaves from root loss, bud blast.",
    commonPests: "Scale, mealybugs, spider mites.", toxicity: "Generally considered non-toxic.", terrariumSuitability: "Suitable for large ventilated orchid cases, not sealed vessels.", notes: "Keep water out of the crown overnight.",
  }],
  [ids.species.fittonia, {
    commonName: "Nerve plant", scientificName: "Fittonia albivenis", family: "Acanthaceae",
    description: "Compact tropical groundcover with jewel-toned leaves traced by bright veins.", nativeHabitat: "Moist rainforest floor in Peru and neighboring South America.",
    growthCharacteristics: "Low creeping stems that root at nodes and respond well to pinching.", matureSize: "3–6 in tall, spreading 12–18 in.",
    lightRequirements: "Low to medium filtered light.", waterRequirements: "Keep lightly and consistently moist.", humidityRequirements: "Thrives at 60–90% humidity.",
    temperatureRange: "65–80°F (18–27°C)", substratePreferences: "Fine, humus-rich terrarium mix with drainage.", fertilizationRecommendations: "Very dilute feed every 6–8 weeks.",
    propagationMethods: "Tip cuttings root readily in moist mix.", commonProblems: "Dramatic wilting when dry; leggy growth in dim light.", commonPests: "Aphids, mealybugs.",
    toxicity: "Generally considered non-toxic.", terrariumSuitability: "Excellent for closed tropical terrariums.", notes: "Pinch tips to keep a dense carpet.",
  }],
  [ids.species.maidenhair, {
    commonName: "Delta maidenhair fern", scientificName: "Adiantum raddianum", family: "Pteridaceae",
    description: "An airy fern with fine black stems and soft fan-shaped leaflets.", nativeHabitat: "Moist shaded slopes and stream edges in tropical Americas.",
    growthCharacteristics: "Rhizomatous clumps with delicate new croziers.", matureSize: "12–20 in tall.", lightRequirements: "Soft filtered light; never hot direct sun.",
    waterRequirements: "Do not let the root ball dry completely.", humidityRequirements: "High humidity with gentle airflow.", temperatureRange: "60–75°F (16–24°C)",
    substratePreferences: "Fine, rich, evenly moist mix.", fertilizationRecommendations: "Quarter-strength feed monthly in active growth.", propagationMethods: "Rhizome division or spores.",
    commonProblems: "Crisp fronds after a dry spell; rot in stagnant saturated soil.", commonPests: "Scale, aphids.", toxicity: "Generally considered non-toxic.",
    terrariumSuitability: "Excellent while compact; prune to preserve scale.", notes: "Old fronds can be cut at soil level after stress.",
  }],
  [ids.species.echeveria, {
    commonName: "Mexican snowball", scientificName: "Echeveria elegans", family: "Crassulaceae",
    description: "A powdery blue-green rosette succulent that offsets into sculptural clusters.", nativeHabitat: "Rocky semi-arid habitats in central Mexico.",
    growthCharacteristics: "Compact rosettes producing offsets and seasonal flower stalks.", matureSize: "4–8 in rosettes.", lightRequirements: "Several hours of bright light or gentle direct sun.",
    waterRequirements: "Water deeply only after the mix is fully dry.", humidityRequirements: "Low to average humidity.", temperatureRange: "50–85°F (10–29°C)",
    substratePreferences: "Mineral-heavy succulent mix with pumice and grit.", fertilizationRecommendations: "Optional dilute cactus feed once or twice in spring.",
    propagationMethods: "Offsets, leaves, or stem cuttings.", commonProblems: "Etiolation in low light; rot from trapped moisture.", commonPests: "Mealybugs.",
    toxicity: "Generally considered non-toxic.", terrariumSuitability: "Suitable only for open, dry terrariums.", notes: "Avoid touching the powdery farina on leaves.",
  }],
  [ids.species.haworthia, {
    commonName: "Zebra haworthia", scientificName: "Haworthiopsis attenuata", family: "Asphodelaceae",
    description: "A compact succulent with firm tapered leaves banded in white tubercles.", nativeHabitat: "Dry shaded scrub in South Africa's Eastern Cape.",
    growthCharacteristics: "Slow clumping rosettes that produce offsets.", matureSize: "4–6 in tall.", lightRequirements: "Bright filtered light; tolerates less sun than many succulents.",
    waterRequirements: "Allow soil to dry fully between waterings.", humidityRequirements: "Low to average humidity with airflow.", temperatureRange: "55–85°F (13–29°C)",
    substratePreferences: "Gritty, fast-draining mineral mix.", fertilizationRecommendations: "Very light cactus feed in spring.", propagationMethods: "Offsets; leaf propagation is slower.",
    commonProblems: "Stretching from low light; translucent leaves from overwatering.", commonPests: "Mealybugs, scale.", toxicity: "Generally considered non-toxic.",
    terrariumSuitability: "Good for open arid displays.", notes: "Shelter from intense afternoon sun behind glass.",
  }],
  [ids.species.fern, {
    commonName: "Boston fern", scientificName: "Nephrolepis exaltata 'Bostoniensis'", family: "Nephrolepidaceae",
    description: "A classic arching fern with a generous fountain of finely divided fronds.", nativeHabitat: "Humid tropical and subtropical forests.",
    growthCharacteristics: "Forms dense crowns and runners; can pause growth in cool dim months.", matureSize: "2–3 ft tall and wide.", lightRequirements: "Medium to bright indirect light.",
    waterRequirements: "Keep evenly moist, easing slightly in winter.", humidityRequirements: "Prefers 50% or higher.", temperatureRange: "60–75°F (16–24°C)",
    substratePreferences: "Rich, moisture-retentive potting mix with good drainage.", fertilizationRecommendations: "Half-strength monthly during active growth.", propagationMethods: "Division or rooted runners.",
    commonProblems: "Leaflet drop from dry air or missed watering.", commonPests: "Spider mites, scale.", toxicity: "Generally considered non-toxic.",
    terrariumSuitability: "Dwarf cultivars work in large displays; standard plants quickly outgrow them.", notes: "A cool shower removes dust and spent leaflets.",
  }],
  [ids.species.maranta, {
    commonName: "Prayer plant", scientificName: "Maranta leuconeura", family: "Marantaceae",
    description: "A low tropical plant whose patterned leaves lift and fold subtly at night.", nativeHabitat: "Moist forests of Brazil.",
    growthCharacteristics: "Spreading rhizomatous stems with rhythmic leaf movement.", matureSize: "10–16 in tall, spreading wider.", lightRequirements: "Medium filtered light.",
    waterRequirements: "Keep gently moist with low-mineral water.", humidityRequirements: "Prefers 55% or higher.", temperatureRange: "65–80°F (18–27°C)",
    substratePreferences: "Airy moisture-retentive mix.", fertilizationRecommendations: "Dilute balanced feed monthly in spring and summer.", propagationMethods: "Stem cuttings or division.",
    commonProblems: "Crisp margins, curled leaves, root decline in heavy mix.", commonPests: "Spider mites, mealybugs.", toxicity: "Generally considered non-toxic.",
    terrariumSuitability: "Good for roomy humid terrariums when pruned.", notes: "This library record is retained for a memorial plant.",
  }],
];

const terrariums = [
  [ids.terrarium.rainforest, {
    name: "Rainforest Jewel", type: "Closed tropical", dateCreated: "2025-11-09", location: "Library sideboard",
    description: "A small green world of moss, silver veins, and slow-moving condensation.",
    lightingSetup: "10 hours beneath a warm-white LED bar; no direct afternoon sun.", humidityRequirements: "Usually 82–92%; vent for an hour if the glass stays fully fogged all day.",
    wateringNotes: "A few tablespoons of filtered water only when the moss lightens and the glass cycle slows.",
    substrateInformation: "LECA drainage layer, charcoal, fine bark, coir, leaf mould, and a live moss top layer.",
    otherInhabitants: "Springtails and dwarf white isopods.", notes: "Rotate one quarter turn each week for balanced growth.",
  }],
  [ids.terrarium.desert, {
    name: "Desert Light", type: "Open arid bowl", dateCreated: "2026-02-17", location: "South studio shelf",
    description: "A sun-washed arrangement of sculptural rosettes, stone, and pale mineral layers.",
    lightingSetup: "Bright south window plus 6 hours of supplemental grow light in winter.", humidityRequirements: "Ambient household humidity with unrestricted airflow.",
    wateringNotes: "Spot-water each root zone only after the mineral mix is completely dry.",
    substrateInformation: "Pumice, coarse sand, lava rock, a small amount of cactus soil, and gravel top dressing.",
    otherInhabitants: "None.", notes: "Keep water away from echeveria crowns and the decorative wood.",
  }],
  [ids.terrarium.nursery, {
    name: "The Nursery", type: "Ventilated propagation case", dateCreated: "2026-06-21", location: "Office shelving",
    description: "A flexible glass case reserved for cuttings, experiments, and temporary residents.",
    lightingSetup: "Dim-to-dawn LED strip at 35% brightness, 12 hours daily.", humidityRequirements: "Target 65–75% with both side vents open.",
    wateringNotes: "Check small vessels twice weekly; water individually rather than misting the whole case.",
    substrateInformation: "No shared substrate; trays hold sphagnum, perlite cups, and small nursery pots.",
    otherInhabitants: "Occasional springtails in moss trays.", notes: "Currently resting between propagation rounds.",
  }],
];

const plants = [
  [ids.plant.milo, { name: "Milo", speciesId: ids.species.monstera, description: "The living-room anchor: generous, a little unruly, and always working on one more leaf.", dateAcquired: "2024-04-06", source: "Neighborhood plant swap", location: "Living room · east window", terrariumId: null, status: "healthy", tags: ["statement", "easygoing", "gifted"] }],
  [ids.plant.opal, { name: "Opal", speciesId: ids.species.calathea, description: "Soft silver stripes and a dramatic opinion about dry air.", dateAcquired: "2025-09-14", source: "Willow & Stem", location: "Bedroom · humidifier shelf", terrariumId: null, status: "needs_attention", tags: ["foliage", "humidity-lover", "pet-safe"] }],
  [ids.plant.etta, { name: "Etta", speciesId: ids.species.hearts, description: "A fine curtain of tiny hearts above the breakfast nook.", dateAcquired: "2025-03-22", source: "Cutting from Marisol", location: "Kitchen · hanging rail", terrariumId: null, status: "healthy", tags: ["trailing", "propagated", "flowering"] }],
  [ids.plant.june, { name: "June", speciesId: ids.species.orchid, description: "A rescued orchid rebuilding roots and holding onto an unexpectedly beautiful second bloom.", dateAcquired: "2026-01-18", source: "Clearance rescue", location: "Reading nook", terrariumId: null, status: "recovering", tags: ["flowering", "rescue", "slow-growing"] }],
  [ids.plant.moss, { name: "Moss", speciesId: ids.species.fittonia, description: "A bright-veined carpet tucked against the front glass.", dateAcquired: "2025-11-09", source: "Terrarium starter plug", location: "", terrariumId: ids.terrarium.rainforest, status: "healthy", tags: ["terrarium", "miniature", "humidity-lover"] }],
  [ids.plant.pip, { name: "Pip", speciesId: ids.species.maidenhair, description: "Fine fronds arching over the terrarium's shaded ridge.", dateAcquired: "2025-11-09", source: "Local fern nursery", location: "", terrariumId: ids.terrarium.rainforest, status: "healthy", tags: ["terrarium", "fern", "delicate"] }],
  [ids.plant.sage, { name: "Sage", speciesId: ids.species.echeveria, description: "The pale rosette at the center of the desert bowl.", dateAcquired: "2026-02-17", source: "Cactus & Clay", location: "", terrariumId: ids.terrarium.desert, status: "healthy", tags: ["succulent", "sun-lover", "terrarium"] }],
  [ids.plant.stripe, { name: "Stripe", speciesId: ids.species.haworthia, description: "A compact striped cluster that makes the dark lava rock feel brighter.", dateAcquired: "2026-02-17", source: "Cactus & Clay", location: "", terrariumId: ids.terrarium.desert, status: "healthy", tags: ["succulent", "slow-growing", "terrarium"] }],
  [ids.plant.fernald, { name: "Fernald", speciesId: ids.species.fern, description: "An old porch fern taking a quiet pause indoors until the heat passes.", dateAcquired: "2023-05-28", source: "Spring garden market", location: "Cool guest room", terrariumId: null, status: "dormant", tags: ["fern", "seasonal", "pet-safe"] }],
  [ids.plant.oldGold, { name: "Old Gold", speciesId: ids.species.maranta, description: "A small prayer plant remembered for the way its leaves folded together every evening.", dateAcquired: "2022-08-13", source: "First apartment windowsill", location: "Formerly the bedroom shelf", terrariumId: null, status: "deceased", dateOfDeath: "2026-06-14", causeOfDeath: "Root decline after a difficult winter", finalNotes: "The healthiest final cutting went to a friend, so a little of Old Gold is still growing elsewhere.", tags: ["remembered", "first-collection"] }],
  [ids.plant.archive, { name: "Pilea propagation tray", speciesId: null, description: "A completed propagation experiment kept for its notes and handoff history.", dateAcquired: "2025-05-02", source: "Kitchen windowsill offsets", location: "Formerly the office shelf", terrariumId: null, status: "healthy", tags: ["propagation", "shared"] }],
];

const care = [
  [ids.plant.milo, "demo-care-milo-water", { activityType: "watering", guidance: "Water deeply when the upper few inches feel dry.", cadenceDays: 10, reminderEnabled: true, nextReminderDate: "2026-08-28", notes: "Empty the cachepot after drainage; the moss pole can take a separate small pour.", sortOrder: 0 }],
  [ids.plant.milo, "demo-care-milo-light", { activityType: "light", guidance: "Keep near bright filtered light and rotate a quarter turn monthly.", cadenceDays: 30, reminderEnabled: false, notes: "The east window is gentle enough for early direct light.", sortOrder: 1 }],
  [ids.plant.opal, "demo-care-opal-water", { activityType: "watering", guidance: "Keep the mix evenly moist with filtered water.", cadenceDays: 6, reminderEnabled: true, nextReminderDate: "2026-08-24", notes: "Check the center of the pot, not only the edges.", sortOrder: 0 }],
  [ids.plant.opal, "demo-care-opal-humidity", { activityType: "humidity", guidance: "Aim for steady humidity above 60% with gentle airflow.", cadenceDays: null, reminderEnabled: false, notes: "Crisp margins appeared during the last dry week.", sortOrder: 1 }],
  [ids.plant.etta, "demo-care-etta-water", { activityType: "watering", guidance: "Let the pot become light, then soak and drain completely.", cadenceDays: 12, reminderEnabled: true, nextReminderDate: "2026-09-01", notes: "Tubers hold more water than the fine vines suggest.", sortOrder: 0 }],
  [ids.plant.june, "demo-care-june-roots", { activityType: "watering", guidance: "Water when visible roots turn from green to silvery.", cadenceDays: 8, reminderEnabled: true, nextReminderDate: "2026-08-25", notes: "Use lukewarm water and keep the crown dry overnight.", sortOrder: 0 }],
  [ids.plant.june, "demo-care-june-custom", { activityType: "custom", customLabel: "Root check", guidance: "Look through the clear liner for firm green or silver roots.", cadenceDays: 21, reminderEnabled: false, notes: "Do not repot again while the new root tips are active.", sortOrder: 1 }],
  [ids.plant.fernald, "demo-care-fernald-season", { activityType: "custom", customLabel: "Seasonal pause", guidance: "Keep just moist while growth is paused; resume feeding with new fronds.", cadenceDays: null, reminderEnabled: false, notes: "Dormant is a collection label here, not true botanical dormancy.", sortOrder: 0 }],
];

const journals = [
  ["demo-journal-new-leaf", { title: "A new leaf, in slow motion", entryDate: "2026-08-18", plantIds: [ids.plant.milo], terrariumIds: [], tags: ["new-growth", "summer", "observation"], content: "## The good kind of waiting\n\nMilo's newest leaf began loosening before breakfast and was almost flat by evening. It is a much lighter green than the older leaves, with a soft shine that should deepen over the next week.\n\n- two clean inner splits\n- no tearing along the edge\n- aerial root finally reached the pole\n\n> Nothing to fix today—just a change worth noticing." }],
  ["demo-journal-rain-glass", { title: "Rain on the glass", entryDate: "2026-08-10", plantIds: [ids.plant.moss, ids.plant.pip], terrariumIds: [ids.terrarium.rainforest], tags: ["terrarium", "humidity", "quiet-moment"], content: "The Rainforest Jewel made its own weather this morning. A fine veil of condensation formed on the cool side, but the front cleared by noon exactly as hoped.\n\nPip has two tiny croziers behind the moss ridge. Moss was pinched back from the fittonia stems so the pale veins can read more clearly through the glass." }],
  ["demo-journal-june-recovery", { title: "Bringing June back", entryDate: "2026-08-05", plantIds: [ids.plant.june], terrariumIds: [], tags: ["recovery", "roots", "orchid"], content: "June's recovery is finally visible above the pot: **three firm root tips** and a leaf that no longer feels limp. The flowers are a bonus, not the measure of success.\n\nFor now, the plan stays simple:\n\n1. wait for silver roots\n2. water and drain fully\n3. leave the crown dry\n4. resist another repot" }],
  ["demo-journal-shelf-shuffle", { title: "The midsummer shelf shuffle", entryDate: "2026-07-22", plantIds: [ids.plant.opal, ids.plant.etta, ids.plant.fernald], terrariumIds: [ids.terrarium.nursery], tags: ["seasonal", "moved", "light"], content: "The afternoon sun has shifted far enough to change the useful light in every room. Opal moved back from the bedroom glass, Etta moved slightly higher, and Fernald is taking the coolest corner.\n\nThe Nursery is empty for now. I like that the collection can have **resting spaces**, too." }],
  ["demo-journal-less-water", { title: "Notes on less water", entryDate: "2026-07-03", plantIds: [ids.plant.sage, ids.plant.stripe], terrariumIds: [ids.terrarium.desert], tags: ["terrarium", "watering", "experiment"], content: "The desert bowl looks better when I treat its residents as individuals rather than watering the landscape. Stripe needed a drink; Sage did not.\n\nA narrow-spout bottle made it easy to keep water below the rosettes and away from the decorative wood. The mineral top layer was dry again by the next morning." }],
  ["demo-journal-old-gold", { title: "Remembering Old Gold", entryDate: "2026-06-14", plantIds: [ids.plant.oldGold], terrariumIds: [], tags: ["memorial", "gratitude"], content: "Old Gold was the first plant that taught me to look twice: once in daylight, and again after the leaves had folded for evening.\n\nLosing the mother plant hurts, but the healthiest cutting is established at a friend's house. This record can hold both truths—the ending, and the part that carried on." }],
];

const events = [
  ["plant", ids.plant.milo, { plantId: ids.plant.milo, eventType: "repotted", eventDate: "2026-04-12", title: "Moved into a roomier pot", detail: "Refreshed the bark-heavy mix and added a cedar support without disturbing the strongest aerial roots." }],
  ["plant", ids.plant.milo, { plantId: ids.plant.milo, eventType: "new_growth", eventDate: "2026-08-18", title: "Newest leaf unfurled", detail: "The first leaf this year to open with inner fenestrations already visible." }],
  ["plant", ids.plant.opal, { plantId: ids.plant.opal, eventType: "health_issue", eventDate: "2026-08-20", title: "Leaf edges turned crisp", detail: "Likely caused by a dry week while the humidifier was off; soil moisture remained even." }],
  ["plant", ids.plant.june, { plantId: ids.plant.june, eventType: "health_issue", eventDate: "2026-02-03", title: "Root loss discovered", detail: "Removed hollow roots and shifted to a smaller ventilated liner with fresh coarse bark." }],
  ["plant", ids.plant.june, { plantId: ids.plant.june, eventType: "recovery", eventDate: "2026-07-28", title: "Fresh root tips appeared", detail: "Three active green tips are visible against the clear liner." }],
  ["plant", ids.plant.june, { plantId: ids.plant.june, eventType: "flowering", eventDate: "2026-08-21", title: "The last buds opened", detail: "A quiet second flush of white flowers opened while root recovery continued." }],
  ["plant", ids.plant.etta, { plantId: ids.plant.etta, eventType: "flowering", eventDate: "2026-07-23", title: "Tiny lantern flowers", detail: "Several small pink flowers appeared along the brightest vines." }],
  ["plant", ids.plant.oldGold, { plantId: ids.plant.oldGold, eventType: "death", eventDate: "2026-06-14", title: "Remembered in the archive", detail: "The mother plant was lost after prolonged root decline; one healthy cutting continues with a friend." }],
  ["terrarium", ids.terrarium.rainforest, { terrariumId: ids.terrarium.rainforest, eventType: "note", eventDate: "2026-05-16", title: "Springtails established", detail: "The cleanup crew is now easy to spot after watering, especially around the cork edge." }],
  ["terrarium", ids.terrarium.desert, { terrariumId: ids.terrarium.desert, eventType: "note", eventDate: "2026-07-03", title: "Switched to targeted watering", detail: "Individual root zones now receive water only when each plant is ready." }],
];

const photos = [
  { owner: "plant", id: ids.plant.milo, file: "monstera-profile.jpg", dateTaken: "2026-04-12", caption: "Settled after repotting, with the new cedar support in place.", tags: ["repot", "profile", "spring"], cover: true },
  { owner: "plant", id: ids.plant.milo, file: "monstera-progress.jpg", dateTaken: "2026-08-18", caption: "The newest leaf midway through unfurling.", tags: ["new-growth", "summer", "comparison"] },
  { owner: "plant", id: ids.plant.opal, file: "calathea-profile.jpg", dateTaken: "2026-08-12", caption: "Silver stripes in soft morning light, before the humidifier pause.", tags: ["foliage", "profile"] , cover: true},
  { owner: "plant", id: ids.plant.etta, file: "string-of-hearts-profile.jpg", dateTaken: "2026-07-23", caption: "The longest vines reached the lower window frame this month.", tags: ["trailing", "flowering", "profile"], cover: true },
  { owner: "plant", id: ids.plant.june, file: "orchid-profile.jpg", dateTaken: "2026-08-21", caption: "The last buds opened while three new roots kept growing.", tags: ["flowering", "recovery", "profile"], cover: true },
  { owner: "terrarium", id: ids.terrarium.rainforest, file: "rainforest-terrarium.jpg", dateTaken: "2026-08-10", caption: "The glass cleared by noon after a cool, rainy morning.", tags: ["terrarium", "moss", "humidity"], cover: true },
  { owner: "terrarium", id: ids.terrarium.desert, file: "desert-terrarium.jpg", dateTaken: "2026-07-30", caption: "Warm afternoon light across the mineral layers.", tags: ["terrarium", "succulent", "summer"], cover: true },
];

const speciesImages = [
  [ids.species.monstera, "monstera-profile.jpg"],
  [ids.species.calathea, "calathea-profile.jpg"],
  [ids.species.hearts, "string-of-hearts-profile.jpg"],
  [ids.species.orchid, "orchid-profile.jpg"],
  [ids.species.fittonia, "species-fittonia.jpg"],
  [ids.species.maidenhair, "species-maidenhair.jpg"],
  [ids.species.echeveria, "species-echeveria.jpg"],
  [ids.species.haworthia, "species-haworthia.jpg"],
  [ids.species.fern, "species-boston-fern.jpg"],
  [ids.species.maranta, "species-maranta.jpg"],
];

async function ensureEvent(kind, id, input) {
  const record = await request(`/api/${kind === "plant" ? "plants" : "terrariums"}/${id}`);
  const exists = record.history?.some((item) => item.kind === "event" && item.date === input.eventDate && item.title === input.title);
  if (!exists) await post("/api/history", input);
}

async function ensurePhoto(input) {
  const route = input.owner === "plant" ? `/api/plants/${input.id}` : `/api/terrariums/${input.id}`;
  let record = await request(route);
  let photo = record.photos?.find((item) => item.originalName === input.file);
  if (!photo) {
    const form = new FormData();
    const bytes = await fs.readFile(path.join(here, "demo-assets", input.file));
    form.append("photo", new Blob([bytes], { type: "image/jpeg" }), input.file);
    form.append(input.owner === "plant" ? "plantId" : "terrariumId", input.id);
    form.append("dateTaken", input.dateTaken);
    form.append("caption", input.caption);
    form.append("tags", input.tags.join(", "));
    photo = await request("/api/photos", { method: "POST", body: form });
  }
  if (input.cover) {
    const coverRoute = input.owner === "plant" ? `/api/plants/${input.id}/profile-photo` : `/api/terrariums/${input.id}/cover-photo`;
    await post(coverRoute, { photoId: photo.id });
  }
}

async function ensureSpeciesImage(speciesId, file) {
  const species = await request(`/api/species/${speciesId}`);
  if (species.imageUrl) return;
  const form = new FormData();
  const bytes = await fs.readFile(path.join(here, "demo-assets", file));
  form.append("image", new Blob([bytes], { type: "image/jpeg" }), file);
  await request(`/api/species/${speciesId}/image`, { method: "POST", body: form });
}

async function main() {
  await request("/api/health");

  for (const [id, data] of species) await put(`/api/species/${id}`, data);
  for (const [id, file] of speciesImages) await ensureSpeciesImage(id, file);
  for (const [id, data] of terrariums) await put(`/api/terrariums/${id}`, data);
  for (const [id, data] of plants) await put(`/api/plants/${id}`, data);
  await post(`/api/plants/${ids.plant.archive}/archive`, { archived: true });

  for (const [plantId, careId, data] of care) await put(`/api/plants/${plantId}/care/${careId}`, data);
  for (const [id, data] of journals) await put(`/api/journal/${id}`, data);
  for (const [kind, id, data] of events) await ensureEvent(kind, id, data);
  for (const photo of photos) await ensurePhoto(photo);

  const dashboard = await request("/api/dashboard");
  const allPlants = await request("/api/plants?scope=all");
  const allSpecies = await request("/api/species");
  const allTerrariums = await request("/api/terrariums");
  const allJournals = await request("/api/journal");
  console.log(`Demo greenhouse ready at ${baseUrl}`);
  console.log(`${allPlants.length} plants · ${allSpecies.length} species · ${allTerrariums.length} terrariums · ${allJournals.length} journal entries · ${dashboard.recentPhotos.length} photos`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
