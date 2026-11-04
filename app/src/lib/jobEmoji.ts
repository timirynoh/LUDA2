// The emoji that best matches a help request ("Need a plumber" → 🚰). Same list on the server (handlers.ts JOB_EMOJI).
export const JOB_EMOJI: [RegExp, string][] = [
  [/plumb|leak|pipe|sink|tap|toilet|water|shower|drain|boiler/i, '🚰'], [/fridge|freezer|refrigerat/i, '🧊'], [/wash(ing)? ?machine|laundry|iron/i, '🧺'],
  [/electric|socket|wiring|light ?bulb|lamp|fuse|power/i, '💡'], [/air ?con|\bac\b|heater|klima/i, '❄️'], [/mov(e|ing)|carry|lift|furniture|sofa|bed\b|box(es)?/i, '📦'],
  [/clean|tidy|mop|wash dishes/i, '🧹'], [/paint/i, '🎨'], [/carpent|wood|shelf|assemble|ikea|door|lock/i, '🔨'], [/car\b|mechanic|tyre|tire|drive|ride|lift to/i, '🚗'],
  [/airport|ercan|flight/i, '✈️'], [/deliver|parcel|package|pick ?up|courier|drop ?off/i, '🛵'], [/shop|groceries|market|buy me/i, '🛒'], [/cook|food|meal|jollof/i, '🍲'],
  [/hair|braid|barber|nails|makeup/i, '💇🏾'], [/laptop|computer|pc\b|software|website|code/i, '💻'], [/phone|screen|iphone|android/i, '📱'], [/wifi|internet|router|modem/i, '📶'],
  [/tutor|lesson|homework|assignment|math|exam|study|teach/i, '📚'], [/translat|turkish|interpret/i, '🗣️'], [/photo|video|camera/i, '📷'], [/print|scan|document|form/i, '🖨️'],
  [/pet|dog|cat/i, '🐾'], [/garden|plant|grass/i, '🌿'], [/baby|child|kid/i, '🧸'], [/queue|line|stand in/i, '⏳'],
]
export const JOB_EMOJI_PICK = ['⚡', '🚰', '🧊', '🧺', '💡', '❄️', '📦', '🧹', '🎨', '🔨', '🚗', '✈️', '🛵', '🛒', '🍲', '💇🏾', '💻', '📱', '📶', '📚', '🗣️', '📷', '🖨️', '🐾', '🌿', '🧸', '⏳']
export const jobEmoji = (text: string) => JOB_EMOJI.find(([r]) => r.test(text))?.[1] ?? '⚡'
