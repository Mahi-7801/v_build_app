/**
 * Telugu UI strings. Keys are lower-cased English source text.
 * Used by the shared LocalizedText component so every screen picks up the
 * selected language without needing per-screen translation wiring.
 */
export const TELUGU_UI: Record<string, string> = {
  // navigation / shared
  home: 'హోమ్', workouts: 'వ్యాయామాలు', history: 'పురోగతి', progress: 'పురోగతి',
  settings: 'సెట్టింగ్\u200Dలు', preferences: 'ప్రాధాన్యతలు', language: 'భాష',
  workout: 'వ్యాయామం', goal: 'లక్ష్యం', difficulty: 'స్థాయి', units: 'యూనిట్లు',
  'voice coaching': 'వాయిస్ గైడెన్స్', 'keep screen on': 'స్క్రీన్ ఆన్\u200Dలో ఉంచండి',
  'auto-start next': 'తదుపరి ప్రారంభించు', 'sign out': 'లాగ్ అవుట్',
  'unlock all workouts': 'అన్నింటినీ అన్\u200Cలాక్ చేయండి',
  beginner: 'ప్రారంభకుడు', intermediate: 'మధ్యస్థ', advanced: 'అధునాతన',
  "today's pick": 'ఈ రోజు ఎంపిక', 'start now': 'ఇప్పుడే ప్రారంభించండి',
  'recent workouts': 'ఇటీవలి వ్యాయామాలు', 'make it yours': 'మీదిగా మార్చుకోండి',
  'sign in / create account': 'సైన్ ఇన్ / రిజిస్టర్', min: 'నిమి', mins: 'నిమి',
  moves: 'చర్యలు', calories: 'కేలరీలు', done: 'పూర్తయింది', next: 'తదుపరి',
  back: 'వెనుక', cancel: 'రద్దు', save: 'భద్రపరచు', close: 'మూసివేయి',

  // auth
  'log in': 'లాగిన్', 'sign up': 'సైన్ అప్', 'sign in': 'సైన్ ఇన్',
  'create account': 'ఖాతా సృష్టించు', 'demo account': 'డెమో ఖాతా', demo: 'డెమో',
  'welcome back': 'తిరిగి స్వాగతం', 'create your account': 'ఖాతా సృష్టించు',
  'sign in to continue your training and track progress.': 'కొనసాగడానికి సైన్ ఇన్ చేయండి మరియు పురోగతిని ట్రాక్ చేయండి.',
  'start your fitness journey — it only takes a minute.': 'మీ ఫిట్నెస్ ప్రయాణం ప్రారంభించండి — ఇది కేవలం ఒక నిమిషం.',
  'your name': 'మీ పేరు', 'email address': 'ఇమెయిల్ చిరునామా', password: 'పాస్\u200Cవర్డ్',
  'please enter your name.': 'దయచేసి మీ పేరు నమోదు చేయండి.',
  'enter a valid email address.': 'చెల్లుబాటు అయ్యే ఇమెయిల్ చిరునామా నమోదు చేయండి.',
  'password must be at least 8 characters.': 'పాస్\u200Cవర్డ్ కనీసం 8 అక్షరాలు ఉండాలి.',
  'please wait…': 'దయచేసి వేచి ఉండండి…', 'something went wrong': 'ఏదో తప్పు జరిగింది',
  'sign in required': 'సైన్ ఇన్ అవసరం', 'please sign in before subscribing.': 'సబ్\u200Cస్క్రైబ్ చేయడానికి ముందు సైన్ ఇన్ చేయండి.',

  // home
  'weekly goal': 'వారపు లక్ష్యం', 'recommended for you': 'మీ కోసం సిఫార్సు చేయబడింది',
  'see all': 'అన్నీ చూడండి', 'your plan report': 'మీ ప్లాన్ నివేదిక',
  'based on your answers': 'మీ సమాధానాల ఆధారంగా', 'daily motivation': 'రోజువారీ ప్రేరణ',
  'unlock every workout': 'అన్ని వ్యాయామాలను అన్\u200Cలాక్ చేయండి',
  'go pro for unlimited access': 'పరిమితి లేని యాక్సెస్ కోసం PRO పొందండి',
  minutes: 'నిమిషాలు', 'kcal burned': 'కేలరీలు బర్న్ అయ్యాయి',
  'fire points': 'ఫైర్ పాయింట్లు', pts: 'పాయింట్లు',
  'workouts done': 'వ్యాయామాలు పూర్తయ్యాయి', 'from workouts you finished. calories = energy burned during training.': 'మీరు పూర్తి చేసిన వ్యాయామాల నుండి. కేలరీలు = శిక్షణ సమయంలో బర్న్ అయ్యే శక్తి.',

  // progress
  'your impact': 'మీ ప్రభావం', 'of training completed': 'శిక్షణ పూర్తయింది',
  'no workouts yet — start your first one!': 'ఇంకా వ్యాయామాలు లేవు — మీ మొదటిదాన్ని ప్రారంభించండి!',
  'workouts coming soon.': 'వ్యాయామాలు త్వరలో వస్తాయి.',
  'no workouts found': 'వ్యాయామాలు కనుక్కోబడలేదు',
  'these totals come from the workouts you finished. each workout earns fire points — reach 5,000 for 40% off pro.': 'ఈ మొత్తాలు మీరు పూర్తి చేసిన వ్యాయామాల నుండి. ప్రతి వ్యాయామం ఫైర్ పాయింట్లు ఇస్తుంది — 5,000 పాయింట్లకు PRO పై 40% తగ్గింపు.',

  // result
  'workout complete!': 'వ్యాయామం పూర్తయింది!', 'great job showing up today.': 'ఈ రోజు హాజరైనందుకు శుభాకాంక్షలు.',
  'share your result': 'మీ ఫలితాన్ని షేర్ చేయండి', 'back to home': 'హోమ్\u200Cకి తిరిగి',
  duration: 'వ్యవధి', exercises: 'వ్యాయామాలు',
  'the body achieves what the mind believes.': 'మనసు నమ్మినదాన్ని శరీరం సాధిస్తుంది.',

  // detail / lists
  'exercise detail': 'వ్యాయామ వివరాలు', 'how to do it': 'ఎలా చేయాలి',
  'coach tips': 'కోచ్ చిట్కాలు', 'choose a day': 'ఒక రోజు ఎంచుకోండి',
  'train anywhere': 'ఎక్కడైనా శిక్షణ', 'no equipment. just you and your body.': 'పరికరాలు లేవు. మీరు మాత్రమే.',
  search: 'వెతకండి', all: 'అన్నీ',

  // player
  skip: 'స్కిప్', 'up next': 'తదుపరిది', pause: 'నిలిపివేయి', resume: 'కొనసాగించు',
  finish: 'పూర్తి చేయి', 'workout paused': 'వ్యాయామం నిలిపివేయబడింది',
  'take a breath — your timer is stopped.': 'శ్వాస తీసుకోండి — మీ టైమర్ ఆగిపోయింది.',

  // pro
  'take your training to the next level': 'మీ శిక్షణను తదుపరి స్థాయికి తీసుకెళ్లండి',
  yearly: 'వార్షిక', 'pro membership active': 'PRO సభ్యత్వం యాక్టివ్\u200Cగా ఉంది',
  'pro active': 'PRO యాక్టివ్', 'all premium workouts unlocked': 'అన్ని ప్రీమియం వ్యాయామాలు అన్\u200Cలాక్ అయ్యాయి',
  'yearly membership · full access': 'వార్షిక సభ్యత్వం · పూర్తి యాక్సెస్',
  'maybe later': 'తర్వాత చూద్దాం', 'unlock pro': 'PRO అన్\u200Cలాక్ చేయండి',
  'all premium workouts unlocked.': 'అన్ని ప్రీమియం వ్యాయామాలు అన్\u200Cలాక్ అయ్యాయి.',
  'welcome to pro!': 'PRO కి స్వాగతం!',
  'could not activate pro': 'PRO ని యాక్టివేట్ చేయడం సాధ్యమవుతలేదు',
  'please check your connection and try again.': 'దయచేసి కనెక్షన్ తనిఖీ చేసి మళ్లీ ప్రయత్నించండి.',

  // settings
  personalize: 'వ్యక్తిగతీకరణ', 'edit profile': 'ప్రొఫైల్ సవరించు',
  'your personal training companion': 'మీ వ్యక్తిగత ఫిట్నెస్ సహచరుడు',
  'are you sure?': 'మీకు ఖచ్చితంగా తెలుసా?',

  // splash
  'premium fitness': 'ప్రీమియం ఫిట్నెస్', build: 'బిల్డ్',
  "let's get to know you": 'మీని ఇంకా తెలుసుకుందాం',
  'your fitness journey\nstarts here': 'మీ ఫిట్నెస్ ప్రయాణం\nఇక్కడ మొదలవుతుంది',
  'no equipment': 'పరికరాలు లేవు', 'personal plan': 'వ్యక్తిగత ప్లాన్',
  'track progress': 'పురోగతి ట్రాక్', 'get started': 'మొదలు పెట్టండి',
  'train smarter · build stronger': 'స్మార్ట్\u200Cగా శిక్షణ · బలంగా నిర్మాణం',
  'preparing your daily workout...': 'మీ రోజువారీ వ్యాయామం సిద్ధమవుతోంది...',
  'your personal workout companion': 'మీ వ్యక్తిగత వ్యాయామ సహచరుడు',

  // onboarding / plan
  male: 'పురుషుడు', female: 'స్త్రీ', other: 'ఇతర',
  'you can change this any time in settings.': 'మీరు దీన్ని సెట్టింగ్\u200Dలలో ఎప్పుడైనా మార్చుకోవచ్చు.',
  'already have an account?': 'ఖాతా ఉందా?', 'tap a body part': 'శరీర భాగాన్ని నొక్కండి',
  'scroll to see all areas': 'అన్ని ప్రాంతాలను చూడటానికి స్క్రోల్ చేయండి',
  weight: 'బరువు', height: 'ఎత్తు',
  'generating the plan\nfor you': 'మీ కోసం ప్లాన్ రూపొందిస్తున్నాము',
  'ai is analysing your 10 answers...': 'AI మీ 10 సమాధానాలను విశ్లేషిస్తోంది...',
  'ai finished analysing your answers.': 'AI మీ సమాధానాల విశ్లేషణ పూర్తి చేసింది.',
  'analyze your body:': 'మీ శరీరాన్ని విశ్లేషించాము:',
  'match your fitness level:': 'మీ ఫిట్నెస్ స్థాయి:',
  'build your plan:': 'మీ ప్లాన్:',
  'ai is writing it...': 'AI రాస్తోంది...',
  'your plan is ready!': 'మీ ప్లాన్ సిద్ధంగా ఉంది!',
  'exercises for you': 'మీ కోసం వ్యాయామాలు', 'your week': 'మీ వారం',
  'your ai report': 'మీ AI నివేదిక', strengths: 'బలాలు',
  'focus areas': 'ఫోకస్ ప్రాంతాలు', recommendations: 'సిఫార్సులు',
  'go to homepage': 'హోమ్\u200Cకి వెళ్ళండి',
  'customized for you': 'మీ కోసం రూపొందించబడింది',
  'ai customized for you': 'AI మీ కోసం రూపొందించింది',

  // chip popups
  'your progress': 'మీ పురోగతి', 'fitness level': 'ఫిట్నెస్ స్థాయి',
  'workouts completed': 'పూర్తయిన వ్యాయామాలు', 'reward at': 'రివార్డ్',
  'pro discount': 'PRO తగ్గింపు', 'still to earn': 'ఇంకా సంపాదించాల్సినవి',
  'reward unlocked': 'రివార్డ్ అన్\u200Cలాక్ అయింది', unlocked: 'అన్\u200Cలాక్ అయింది',
  locked: 'లాక్ అయింది', 'training days': 'శిక్షణ రోజులు',
  'total minutes': 'మొత్తం నిమిషాలు', 'calories burned': 'బర్న్ అయిన కేలరీలు',
  sessions: 'సెషన్లు', 'days / week': 'రోజులు / వారం', 'stay fit': 'ఫిట్\u200Cగా ఉండండి',
};

/** Pattern-based translations for dynamic strings that contain numbers. */
const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^(\+[\d,]+\s*)fire points$/i, (m) => `${m[1]}ఫైర్ పాయింట్లు`],
  [/^([\d,]+\s*)\/\s*([\d,]+\s*)points to pro reward$/i, (m) => `${m[1]}/${m[2]} PRO రివార్డ్ వరకు పాయింట్లు`],
  [/^([\d,]+\s*)points\s*·\s*pro reward unlocked$/i, (m) => `${m[1]} పాయింట్లు · PRO రివార్డ్ అన్\u200Cలాక్ అయింది`],
  [/^earn\s+([\d,]+\s*)more to get (\d+)% off pro\.$/i, (m) => `PRO పై ${m[2]}% తగ్గింపు కోసం ఇంకా ${m[1]} పాయింట్లు సంపాదించండి.`],
  [/^(\d+)\s*pts$/i, (m) => `${m[1]} పాయింట్లు`],
  [/^(\d+)\s*workouts$/i, (m) => `${m[1]} వ్యాయామాలు`],
  [/^(\d+)\s*days\/wk$/i, (m) => `${m[1]} రోజులు/వారం`],
  [/^(\d+)\s*kcal$/i, (m) => `${m[1]} కేలరీలు`],
  [/^(\d+)%\s*off$/i, (m) => `${m[1]}% తగ్గింపు`],
];

export function translateText(lang: string, text: string): string {
  if (lang !== 'te' || !text) return text;
  const key = text.trim().toLowerCase();
  if (TELUGU_UI[key]) return TELUGU_UI[key];
  for (const [re, make] of RULES) {
    const m = text.trim().match(re);
    if (m) return make(m);
  }
  return text;
}
