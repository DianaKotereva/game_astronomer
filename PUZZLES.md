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

*Design; mirror optics are the second build phase.*

### Purpose
Astronomy as the dominant language. The player must measure the sky before
touching any metal.

### Initial observation
An open courtyard under the stars, with bronze mirrors on pivots, an elevated
aperture, and a stone bed marked with a figure that is *not* one of the modern
constellations.

### Evidence
- The Book fragment *On the court of mirrors*: the mirrors hold an **angle**,
  not a beam — each pair is set to the angular separation of two stars of a
  figure.
- Observation Mode measures angular separation between a marked star (`F`) and
  the star under the sight.
- The figure on the bed is a *temple* figure, so the player must first recognise
  which modern stars it is drawn over (§35).

### Required deduction
Identify the figure from invariant stars, measure the separations of its edges,
set each mirror pair to that separation.

### Physical manipulation
Each mirror is a draggable axis with an engraved angular scale.

### Magical operation
**Stellar Light** to supply the beam (starlight is too thin to see unaided —
this is the room that makes the first Book fragment about gathered light pay
off), and **Constellation Thread** to bridge the one mirror whose pivot is
broken.

### Verification
Light completes the circuit and the figure on the floor ignites, edge by edge, in
the order the mirrors pass it along.

### Failure feedback
The beam stops at the first wrong mirror and scatters. The court stays dark past
that point, which tells the player exactly which pair is wrong.

### Brute-force protection
Angles are continuous and the tolerance is tight; there is no way to read the
correct angle other than from the sky.

---

## 4. The Archive of the Sky

*Design; exploration space rather than a mechanism.*

### Purpose
Establish that the temple's astronomers were people, and deliver the revelation
that the sky itself has moved (§36).

### Contents
Broken tablets, observation journals in six hands, unfinished calculations, a
diagram corrected three times in three different inks, a failed magical
experiment still faintly resonant, and the dispute: one astronomer measuring the
pole star's drift and blaming the measurement, another — later, smaller, angrier
— writing *"it has not moved. WE have moved."*

### Deduction
Precession. The temple was cut for a sky that has since slid out from under it,
and its pole star was Thuban, not Polaris. This reframes every alignment the
player has already made.

### Magical operation
**Astral Recall** (taught here) shows fragments of the arguments that happened in
this room — never the whole, never the reason.

---

## 5. The Final Observatory

*Design; the climax.*

### Purpose
Combine all three languages, and require at least three discoveries made
elsewhere (§75).

### Required, all at once
1. The historical sky — the epoch must be set back to the builders' era, using
   what the Archive taught (astronomy).
2. The dome's rings must be aligned to a target that only exists in *that* sky
   (mechanism).
3. The figure's missing edge must be restored with **Constellation Thread**,
   because the anchor stone it once ran to is broken (magic).
4. **Celestial Resonance** to bring the dome up.
5. **Zenith**, which is only available once the last Book fragment is recovered.

### Verification
The temple answers across every room the player has been in: shutters open,
mirrors turn, the orrery runs, engraved scales light with points of cold light.
A map appears across the floor — not of the temple, and not of the known
constellations.

### The answer, and the larger question
The player learns *what the astronomers saw*: something that keeps no orbit and
is not fixed, measured eleven times and the same eleven times. They learn why the
temple was abandoned — not fear, but that a model taught for three hundred years
could not hold it. What it *is* remains open.
