# What we learned from Blob Cup

Glenn shared the game code of [Blob Cup](https://blob-cup.vercel.app/) because he likes how its shooting feels. We studied how it works and then built our own versions of the ideas that make it fun. **Nothing was copied**: no code, art, sounds, words or tuning numbers. Everything in our game is written from scratch and tuned by playing our game.

## How Blob Cup's shot works (in short)

1. You aim with the pointer, then hold to charge. While you hold, a shooter runs up and the camera creeps forward.
2. Dragging sideways while holding bends the shot. Dots show the path, and they change colour in the perfect zone.
3. When you let go, the game **decides the whole shot at once**: its path, whether it goes in and what the keeper does. Then it plays that out like a short animation.
4. Every moment has feedback: camera shake, a fire trail that grows with power, a wobbling net, a shockwave on the grass and a celebrating crowd.

We do steps 1, 2 and 4 in our own way. Step 3 is different on purpose: our ball is real physics, so it really flies, bends, hits the post and bounces. (Blob Cup has no posts to hit at all: a shot is a goal, a save or over the bar.)

## Their keeper (the heart of the fun)

The keeper turns every shot into a small duel. The rules it follows are simple, and they're the most useful thing to learn from:

- **Soft shots get saved.** Without enough power the keeper always gets there.
- **It reads you, or it guesses.** Most of the time it dives toward where your shot is going; sometimes it just picks a side. Easy opponents guess more often.
- **Curl fools it.** A big bend sends it the wrong way, and the tutorial teaches you to bend the ball around it.
- **Hard shots are harder to read.** The more power, the further off its dive can be.
- **Its reach depends on the shot.** Soft shots are easier to reach, and a perfect strike can't be saved.
- **It reacts, then dives.** There's a short pause before it moves; better keepers react faster.
- **It looks alive.** It bobs while you aim and squashes when it lands.

Each opponent is a different mix of these: reaction time, reach, how often it reads you and how much curl it can handle. The gold zone also gets narrower against the better opponents.

## Our game vs Blob Cup

| Area | Blob Cup | Our game before | Our game now |
|---|---|---|---|
| Ball flight | Path decided at the kick, then played back | Real physics with our own curl | Same, on purpose |
| Holding a shot | Camera creeps forward during the run-up | Camera stood still | Camera slowly pushes in and the view tightens a little |
| The kick | Camera shake | Nothing | Shake (bigger on a perfect strike), grass and dust fly up, "PERFECT!" pops up with a chime |
| Moving the mouse | Camera follows the pointer | Nothing | The view turns slightly around the goal (desktop only) |
| Phones | Slower meter on touch screens | Same speed everywhere | Meter a bit slower on touch screens, and below the goal on tall screens |
| Aim line | Moving dots that change colour in the perfect zone | Still dotted line and a plain target ring | Dashes flow toward the goal, the ring grows with power, both turn gold in the gold zone |
| Trail | Fire trail that grows with power | Thin pink ribbon | Wider and longer the harder you hit; gold with glitter on a perfect strike |
| Net | Wobbles back when the ball goes in | Didn't move | Bulges where the ball really hits it, more for harder hits |
| Posts | None | Real posts and crossbar, a banner on a hit | Also a ringing "tonk", a camera jolt and a crowd "ooh" |
| Scoring a goal | Shockwave on the grass, crowd celebrates | A banner | Short slow motion, camera shake, confetti cannons, gold banner for a perfect strike |
| Sound | Recorded music, crowd, kick and cheer; mute button | None | Kick, post, net, bounce, chime, crowd murmur, cheer and "ooh", all made in code; a mute button that remembers your choice |
| Learning to play | A 3-step tutorial that pauses the game | One fixed hint | Tips on your first visit that follow what you do, and stop once you've curled a shot |
| Score | A tournament against 3 opponents | None | Goal counter and "3 in a row!" streaks (the full shootout comes later) |
| Keeper | Yes, see above | None | Next step |
| Overall look | Glow, blurred edges, film-style colours | Blender's colours | Same, on purpose |

## What we deliberately did not take

- **The scripted flight.** Deciding everything at the kick is easy to balance, but then the ball can't really hit anything. Glenn wants collisions, so we keep real physics: the posts, the net and soon the keeper are real objects the ball bounces off.
- **The visible shooter and the run-up.** Glenn doesn't want a third-person player, and a run-up adds a delay between letting go and the kick. Our ball leaves the moment you let go.
- **Their screen effects** (glow, blur and film colours). Glenn's stadium is lit to look exactly like it does in Blender, and these would change those colours. A soft glow just for perfect strikes could be worth trying later.
- **Their art, sounds, words and numbers.** Our sounds are made in code for now (placeholders until we pick real recordings), our words are our own, and every number is tuned in our game.

## Next: our keeper (proposal)

- **Look**: a cute, rounded keeper made from simple shapes, in the kodeclubs style, as a placeholder until there's a Blender model. How it moves doesn't depend on how it looks, so the model can be swapped in later.
- **Brain**: when you kick, it sees which way the ball **starts** going, not where the curl will take it. That's why curl beats it, and it comes straight out of our real physics, with no dice roll. Better keepers also allow for some curl.
- **Timing**: it waits a moment (its reaction time), then dives toward its guess at a limited speed and with a limited reach. Sometimes it guesses a side instead of reading you.
- **Real saves**: the keeper is a physics object, so a save is a real collision. The ball can be pushed wide, deflect in off the post or squeeze under the dive.
- **Alive**: it bobs while you aim and shifts a little toward where you're aiming, which gives you a clue and a chance to fake it out.
- **Difficulty**: easy, normal and hard change its reaction time, reach, dive speed, how often it reads you and how much curl it understands.
- **Fair**: we test it with scripted shots, like the shooting tests we have today, so each level saves a fair share and corners and perfect strikes stay very hard to stop.

## Ideas for later

- A ladder of opponents that get harder (a sharper keeper, a narrower gold zone).
- Weather that changes per opponent, like rain or snow.
- Recorded sounds and music instead of the ones made in code.
