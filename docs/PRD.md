# Street Animal Care App — Product Requirements Document (PRD)

Prepared: 2026-08-10. (Historical document — the original product brief.
Where the shipped product diverges, README.md and docs/PROJECT.md are
authoritative.)

## 1. Summary

The Street Animal Care App is a social-impact platform designed to improve the
welfare of street animals in Türkiye. It enables animal lovers, veterinarians,
and activists to coordinate the feeding, health, and wellbeing of street dogs
and cats effectively.

## 2. Problem

Street animals in Türkiye face significant problems, especially around feeding
and medical care. Today:

- People who want to feed street animals don't know which areas already
  receive enough care
- Animal health issues (illness, injury) are not tracked or recorded
  systematically
- Multiple people care for the same animal without coordination
- Veterinary advice is hard to reach and treatment history is not stored
  centrally

## 3. Approach

The app integrates an interactive map, an animal-profile system, and social
components to provide:

- Systematic area-based tracking and coordination
- A central record of each animal's health and feeding history
- Social connection and increased collaboration across the community

## 4. Core features

### 4.1 Interactive map

The home screen shows a map of Türkiye colored by animal population and care
level per area.

**Color coding (original concept):**

- Green: enough food/water and care
- Yellow: moderate care
- Red: urgent help needed

Users add actions like "left food", "left water", or "animal sighted"; each
action records date, time, and user.

*(Shipped implementation: exact drop points with a 100 m green halo that fades
over time; the red base layer was deliberately dropped — see docs/NOTES.md.)*

### 4.2 Animal profiles

Every cat and dog has a unique profile page holding:

- Photos and identifying details (color, size, markings)
- Health status (illness, injury, treatment history)
- Medication records (what, when, by whom)
- Feeding and watering info
- User comments and observations

Vet-verified medical information is displayed separately from user comments.

### 4.3 Adding animals

Users photograph an animal on the "new animal" page. The system uses AI to
check whether it was already registered:

- First sighting: a new profile is created and the user adds the basics
  (location, date, etc.)
- Already registered: the user is redirected to the existing profile

### 4.4 User profiles and social network

Every user has a profile listing the animals they care for. Users can:

- See and connect with others caring for the same animal
- Coordinate via direct messaging
- Share their animals and experiences on their care page

### 4.5 Notifications

When an area turns "red" (urgent help needed), all users active in that area
receive an instant notification.

## 5. MVP scope

The first phase ships:

- User registration and login
- Interactive map and area system
- Food/water actions and tracking
- Manual animal profiles
- Animal health and medication records
- Basic notifications

**Planned for later phases:** AI animal recognition, richer social features,
reports and analytics.

## 6. Technical approach

Modern, scalable, reliable technologies:

- **Frontend:** web and mobile (React Native)
- **Backend:** Node.js and Express
- **Database:** PostgreSQL and PostGIS (for geospatial queries)
- **Maps:** Leaflet + OpenStreetMap
- **Auth:** JWT and password hashing

## 7. Success metrics

- Active users and month-over-month growth
- Registered animals and tracking quality
- Response rate during red-alert hours
- User engagement and quality of social connections
- Number of veterinary and organizational partnerships

## 8. Social impact

The app aims to directly improve street animals' quality of life.

**Goals:**

- Reduce feeding and care gaps
- Detect animal health issues faster
- Ease access to veterinary services
- Raise public awareness of street animals
