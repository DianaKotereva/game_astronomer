# Puzzles

Every major puzzle is recorded in the format of §64. The governing rule
throughout is §31: **magic must not bypass understanding.** No mechanism in this
game can be solved by casting spells at it, and none can be solved by machinery
alone.

---

## 1. The Hall of Meridian

*Implementation: `src/puzzles/hallOfMeridian.js`, `src/world/chambers/hallOfMeridian.js`,
`src/mechanisms/meridianCircle.js`*

### Purpose
Teach the entire grammar of the game in one room: that the architecture is an
instrument, that the sky is simulated and readable, that mechanisms are heavy and
analogue, and that magic completes a relationship the player has already set up.
It is also the room that teaches *time is a thing you turn*.

### Initial observation
A hall thirty metres long and twenty-four high, running north–south. A slit the
length of the vault. A line of bronze inlaid in the floor directly beneath it,
flanked by black stone and a graduated scale running north. A shaft of moonlight
falls through the slit — and lands *beside* the line, not on it. At the north
end, a three-metre bronze ring on two piers, its sighting arm set to nothing in
particular. Near the door, a bronze drum graduated in twenty-four parts.

### Evidence
- The stripe of moonlight is parallel to the bronze line but offset from it.
- The floor scale is graduated in degrees, increasing northward, readable with
  `E`. Reading it while the beam is present states the altitude aloud.
- The sighting ring is graduated 0–90 from the north horizon to the zenith.
- A shallow inscription on the west wall, invisible under a lantern held in
  front of it — it needs light raking across it from one side, which is exactly
  what Stellar Light does. It reads: *"Set the arm to the crossing, and the house
  will answer."*
- Observation Mode draws the meridian as an arc overhead, and the moon can be
  seen approaching it.

### Required deduction
Three steps, each of which the room states physically:
1. The stripe lies on the bronze line only when the source is *on the meridian*.
   It is offset now because the moon has not crossed yet.
2. How far north the stripe's southern edge falls is a measure of the source's
   altitude at that crossing — that is what the floor scale is for.
3. The ring must be set to that same altitude. "The crossing" in the inscription
   is a measurement, not a place.

### Physical manipulation
- The **drum of hours** is dragged with the mouse. It is the time control: one
  full turn is two hours of sky, and the heavens wheel overhead while it turns.
  The player watches the stripe swing toward the bronze line and settle on it.
- The **sighting arm** is dragged to an altitude on the ring's graduation. It is
  heavy (inertia 46, stiction 0.9), has real backlash, and settles with a couple
  of oscillations after release.

### Magical operation
**Celestial Resonance (3)** on the ring. Nothing else works, and it only works
after both conditions above are true.

### Verification
The world says it. The ring locks; a low note lands under the room; two stone
counterweights descend the shafts either side of the north doorway and the great
shutter rises, grinding, shedding centuries of dust. Nothing on screen says
"solved".

### Failure feedback
Resonance answers at any configuration, badly — which is the point. The three
partials of the resonance voice detune and beat against each other in proportion
to the error, the ring of light cannot hold a circle and wanders, and the
mechanism shivers without waking. Near-correct produces a partly closed circle
and a nearly-consonant tone; correct produces a clean fifth and octave. The
puzzle is solvable with your eyes shut.

### Brute-force protection
Two independent conditions must be satisfied at once, and they live on different
controls: the drum sets *when*, the arm sets *how high*. Sweeping the arm through
its range while the moon is nowhere near the meridian produces nothing at any
angle, because the transit term multiplies to zero. The arm is also genuinely
heavy — a full sweep takes several seconds of sustained dragging — so random
search is slower than reading the floor.

---

## 2. The Chamber of Wandering Stars

*Design; the orrery mechanism and calibration are the second build phase.*

### Purpose
Mechanism manipulation as the dominant language (§31: "one primarily mechanism
manipulation"). Also the room that establishes planets as *wandering* stars, and
that the temple's engines are calculators rather than models.

### Initial observation
A vast well with an orrery of nested bronze rings on stone bearings, driven by a
gear train and a descending counterweight. It is visibly mis-set: one ring stands
at an angle that agrees with nothing.

### Evidence
- Each ring carries an engraved scale and the name of one wanderer.
- The reading arm below the rings points at a graduated bed.
- A Book fragment recovered here (*On the wandering stars*) states the engine is
  a calculator, and that "someone moved the third ring and did not move it back".
- The real planetary positions are visible in the sky through the well, and
  Observation Mode names them.

### Required deduction
The rings must be set to where the wanderers *actually are tonight* — which the
player can go and look at. The third ring is the one that disagrees.

### Physical manipulation
Each ring is a separate heavy axis, dragged individually. The counterweight is
released only when the last ring passes its detent.

### Magical operation
**Celestial Resonance** to wake the train; **Gravity Lens** to hold the
counterweight's descent long enough for the final ring to seat (the fragment
recovered here teaches Gravity Lens).

### Verification
The whole train turns for the first time, the counterweight descends into the
undercroft, and the reading arm swings to a date.

### Failure feedback
A mis-set ring jams the train: it moves a few degrees and stops hard, with the
counterweight visibly straining.

### Brute-force protection
Five rings with continuous travel; the correct configuration is a specific set of
five angles that exist in the sky overhead and nowhere else.

---

## 3. The Court of Reflections

*Built. Optics validated by `tools/courtcheck.mjs`.*

### Purpose
Astronomy as the dominant language. The player must measure the sky before
touching any metal.

### Initial observation
An open courtyard under the whole sky — the first space in the temple with no
roof at all. A polished black field fourteen metres across carries a figure
inlaid in bronze at 0.24 metres to the degree: four stars, four edges, and a
mirror mount standing on each of the four stars. West, high in the wall, a
dressed aperture. East, a bronze bowl on a black plinth.

### Evidence
- The Book fragment *On the court of mirrors*: the mirrors hold an **angle**,
  not a beam — each mount is set to the angular separation of two stars of the
  figure, "so that light entering along one edge leaves along the next".
- Observation Mode measures angular separation between a marked star (`F`) and
  the star under the sight.
- The figure is **the Gate**, a *temple* figure, so it is legible only to a
  player who has recovered the temple's own constellation set in the Archive
  (§35, §83). Its four stars are Vega, Deneb, Albireo and Altair; all four are
  above the horizon at the hour the slice takes place.
- Each mount carries a cut **datum** mark. The dial reads degrees from the
  datum, so the number to enter is the raw separation and nothing derived.

### Required deduction
Recognise the Gate from its invariant stars, measure the separation of each
edge, and set the mount standing on a star to the separation of the edge
*leaving* that star. The four values are 23.85°, 22.29°, 19.67° and 34.20°.

### Physical manipulation
Four draggable rotary axes, each graduated every degree with every fifth long.
Seating tolerance is 0.6°.

### Magical operation
**Stellar Light** into the collector — the court's whole optical path is fed by
gathered starlight, which is what makes the first *gathered light* fragment pay
off — then **Celestial Resonance** to complete. Solving awards *Of the third
ring*, the collimation refinement the Final Observatory later depends on.

### Verification
The beam is genuinely ray-traced through the mirrors as they actually stand. It
walks the figure mount by mount, each seated mount showing a thin ring of light
around its dial, and terminates in the bowl.

### Failure feedback
A wrong mirror does not fail a check — it sends the light somewhere else, and
the player can see exactly where it goes and therefore which way to turn. Past
the first badly-set mount the path leaves the court entirely.

### Brute-force protection
Four continuous axes. Measured over 200 000 random configurations, 0.008% land
in the bowl. The closest two dial values differ by 1.56°, more than twice the
seating tolerance, so a mistaken pairing of edge to mount does not pass.

---

## 4. The Archive of the Sky

*Built. Evidence, not machinery.*

### Purpose
Establish that the temple's astronomers were people, and deliver the revelation
that the sky itself has moved (§36).

### Initial observation
A barrel-vaulted reading hall, deliberately low where the rest of the temple is
monumental. Nine shelf bays with the scroll cases still in them, six lecterns
worn hollow where forearms rested, a north wall of arithmetic struck through and
redone, and an armillary somebody stopped halfway through dismantling. The only
sky is a clerestory above the arcade, too high to read by.

### Evidence
Two tablets on a stand in the west niche, set side by side by someone who wanted
them compared — and both cut a finger deep, so the lantern lies flat across them
and shows nothing.

### Required deduction
The temple has already said it, in the Hall of Meridian: shallow cutting is
"meant to be read by a light held to one side, not by a lamp set before it". The
lantern hangs at the reader's own hand and lights along the line of sight.
Stellar Light arrives from wherever the star actually is, and rakes.

### Physical manipulation
None, by design. This is the room with no mechanism in it.

### Magical operation
**Stellar Light** held on the stand recovers the dispute. **Astral Recall**
shows a scholar carrying a leaf from the stand to the shelves on the last night
the room was used — a route, not a label. Stellar Light on that bay recovers
*The slow turning*.

### Verification
The raking light finds the cutting and the text resolves; the leaf enters the
Book and the temple's own figures become legible.

### Failure feedback
Under the lantern the tablets stay blank, though moving the light shows that
they do carry relief — which is the hint. A wrong bay is simply a bay of cases
and dust.

### Brute-force protection
Nine bays, and lighting each one is slow. Recall names the route; without it the
search is tedious rather than impossible, which is the intended pressure — the
room is not trying to lock the player out, it is trying to make them look.

---

## 5. The Final Observatory

*Built. Sight line and epoch range validated at build time.*

### Purpose
The convergence (§75). Three things learned in three other rooms have to arrive
together, and this room supplies none of them.

### Initial observation
A drum thirty-two metres across under a shuttered dome. Eight mirrors on their
bearings in eight niches. A great polar axis on the central platform with two
graduated meridian rings — and **no adjustment of any kind**. Cut through the
north wall, 13.4 metres up, a slit a hand wide. Everything in the room points at
the same empty piece of sky.

### Evidence
- The axis is cut at the altitude of the celestial pole, and the pole never
  moves — so the instrument is not what is wrong.
- *The slow turning*, from the Archive: every alignment here was cut for a sky
  that has since moved out from under it.
- The epoch wheel: four metres of bronze graduated in ages, not hours.

### Required deduction
Do not aim anything. Wind the sky back until the builders' pole star returns to
the pole. Thuban reaches it 4 786 years before J2000, 0.040° off — closer than
Polaris has ever come to ours, and 25.6° from where Thuban stands tonight.

### Physical manipulation
The epoch wheel, the heaviest axis in the game (inertia 220, stiction 6.0). The
target is 1.84 turns, inside its 3.2-turn travel. Winding away again loses the
alignment.

### Magical operation
**Stellar Light** into the instrument head — which requires *Of the third ring*
from the Court, or the light will not collimate and the tube does nothing.
**Constellation Thread** to close the Nail's figure around the axis. **Celestial
Resonance** to wake it. Then **Zenith**, once, which only becomes possible after
the last leaf is recovered.

### Verification
The temple answers: shutters come off their seats, eight mirrors turn in
sequence, dust comes off every bearing that has not moved in three centuries.
No text says "solved".

### Failure feedback
Before the alignment, Stellar Light goes into the tube and out of the slit into
empty sky, and the room says so. Sighting the axis at the wrong epoch shows
empty vanes. The wheel reports the Nail's current distance from the true point,
so the player always knows whether they are getting warmer.

### Brute-force protection
The wheel travels 8 320 years and the window is 0.6° wide — roughly 130 years of
winding out of 8 320, and there is no reason to stop there without knowing what
you are looking for. Nothing else in the room responds at all until it is right.

### The answer, and the larger question
The player learns *what the astronomers saw*: something that keeps no orbit and
is not fixed, measured eleven times and the same eleven times. They learn why the
temple was abandoned — not fear, but that a model taught for three hundred years
could not hold it. What it *is* remains open.
