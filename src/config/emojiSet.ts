import { LABELS } from '@/config/labels';

// The emoji the icon picker offers (components/IconPicker), by group, each with words to find it
// by. No emoji library: a curated set that fits what's given an icon here (notebooks, lists,
// Overviews, activity types, converters, block parts), and any other emoji can be typed or pasted.
// A new emoji is one entry; a new group, one entry and its name in LABELS.iconPicker.groups.

export type EmojiGroup = keyof typeof LABELS.iconPicker.groups;
export interface EmojiChoice { emoji: string; words: string }

const g = (list: string): EmojiChoice[] => list.trim().split('\n').map((line) => {
  const [emoji, ...words] = line.trim().split(' ');
  return { emoji, words: words.join(' ') };
});

export const EMOJI_SET: Record<EmojiGroup, EmojiChoice[]> = {
  study: g(`
    📚 books study reading library
    📓 notebook notes
    📒 ledger notes yellow
    📕 book red
    📗 book green
    📘 book blue
    📝 memo writing notes
    ✏️ pencil writing
    🖊️ pen
    🎓 graduation university degree
    🏫 school
    🧑‍🏫 teacher lecture
    📐 maths geometry ruler
    🧮 abacus maths calculate
    🔬 microscope science biology lab
    🧪 test tube chemistry experiment
    🧬 dna genetics biology
    🔭 telescope astronomy
    🌐 globe web languages
    💡 idea light bulb
    🧠 brain psychology thinking
    🗂️ folders files archive
    📁 folder
    📂 open folder
    📋 clipboard list checklist
    📌 pin important
    📎 paperclip attachment
    🗓️ calendar schedule
    ⏰ alarm clock time
    ⏳ hourglass waiting
  `),
  work: g(`
    💼 briefcase work job
    🏢 office building company
    💻 laptop computer code
    🖥️ desktop computer
    📊 chart bar data statistics
    📈 chart up growth
    📉 chart down decline
    💰 money bag finance
    💵 money cash dollar
    🏦 bank finance
    🧾 receipt invoice tax
    ✉️ email letter mail
    📞 phone call
    🤝 handshake meeting deal
    🎯 target goal aim
    🚀 rocket launch project
    🛠️ tools fix build
    ⚙️ gear settings process
    🔧 wrench repair
    🔑 key password access
    🔒 lock secure private
    ✅ check done tick
    ❗ important exclamation
    ❓ question
    ⭐ star favourite
  `),
  nature: g(`
    🌍 earth world globe africa europe
    🌏 earth world asia australia
    🌎 earth world americas
    ☀️ sun sunny weather
    🌤️ sun cloud weather
    ☁️ cloud weather
    🌧️ rain weather
    ⛈️ storm thunder
    ❄️ snow cold winter
    🌊 wave ocean sea water
    💧 water drop
    🔥 fire hot
    ⚡ lightning energy electricity
    🌱 seedling plant growth
    🌳 tree forest
    🌲 pine tree forest
    🍂 leaves autumn
    🌸 blossom flower spring
    🌻 sunflower
    🍄 mushroom fungi
    ⛰️ mountain hiking
    🏔️ snow mountain
    🌋 volcano geology
    🏝️ island beach
    🪨 rock geology stone
    💎 gem crystal mineral
    ♻️ recycle environment sustainability
  `),
  animals: g(`
    🐶 dog pet
    🐱 cat pet
    🐦 bird
    🦅 eagle bird
    🦆 duck bird
    🐟 fish
    🐠 tropical fish reef
    🐳 whale ocean
    🐢 turtle
    🦋 butterfly insect
    🐝 bee insect
    🐞 ladybird beetle insect
    🦊 fox
    🐻 bear
    🦁 lion
    🐘 elephant
    🦉 owl wisdom
    🐾 paw prints animals
  `),
  activities: g(`
    🏃 run running jog
    🚴 cycling bike ride
    🏊 swimming swim
    🥾 hiking boot walk trail
    🧗 climbing
    🏋️ weights gym strength
    🧘 yoga meditation
    ⚽ football soccer
    🏀 basketball
    🎾 tennis
    🏸 badminton
    ⛷️ skiing
    🏄 surfing
    🎨 art painting
    🎵 music
    🎸 guitar music
    🎹 piano music
    🎬 film movie
    📺 tv show
    🎮 games gaming
    📷 camera photo
    ✈️ plane travel flight
    🚆 train travel
    🚗 car drive
    🧳 luggage travel trip
    🗺️ map travel
    🏠 home house
    🛒 shopping cart groceries
  `),
  food: g(`
    🍎 apple fruit
    🥕 carrot vegetable
    🥦 broccoli vegetable
    🍞 bread
    🧀 cheese
    🍳 cooking egg breakfast
    🍕 pizza
    🍜 noodles ramen
    🍣 sushi
    🥗 salad healthy
    🍰 cake dessert
    ☕ coffee
    🍵 tea
    🍷 wine
    🍽️ meal dinner restaurant
  `),
  people: g(`
    😀 happy smile
    😊 blush smile
    🙂 slight smile
    😎 cool sunglasses
    🤔 thinking
    😴 sleep tired
    🥳 party celebrate
    ❤️ heart love
    💪 strong muscle
    👍 thumbs up yes
    👋 wave hello
    👶 baby
    👪 family
    🧑‍⚕️ doctor health
    🧑‍🔬 scientist
    🧑‍💻 developer coder
    🧑‍🍳 cook chef
    🧑‍🌾 farmer
  `),
  symbols: g(`
    🔴 red circle
    🟠 orange circle
    🟡 yellow circle
    🟢 green circle
    🔵 blue circle
    🟣 purple circle
    ⚫ black circle
    ⚪ white circle
    🟥 red square
    🟩 green square
    🟦 blue square
    🔺 triangle up
    🔷 diamond blue
    ➕ plus add
    ➖ minus
    ✖️ multiply cross
    ➗ divide
    🔁 repeat loop
    🔄 refresh cycle
    ♾️ infinity
    ⚖️ scales balance law
    ⚠️ warning
    🚫 forbidden no
    🏁 finish flag deadline
    🚩 flag
    🏷️ tag label
    🔗 link
    #️⃣ hash number
  `),
};

export const EMOJI_GROUPS = Object.keys(EMOJI_SET) as EmojiGroup[];

// Emoji matching a search: every word typed starts one of its words.
export function searchEmoji(query: string): EmojiChoice[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all = Object.values(EMOJI_SET).flat();
  return all.filter((e) => words.every((w) => e.words.split(' ').some((x) => x.startsWith(w))));
}

// A short row for small pickers (a block part's icon): the first few of every group.
export const COMMON_EMOJI: string[] = EMOJI_GROUPS.flatMap((k) => EMOJI_SET[k].slice(0, 5).map((e) => e.emoji));
