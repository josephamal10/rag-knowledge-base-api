import type { KbCategory } from '../../common/kb-category';

/**
 * Fictional sample knowledge base for the public demo ("demo-club").
 * Every name, price, address and phone number here is made up.
 */
export const DEMO_CLUB_DOCUMENTS: { category: KbCategory; text: string }[] = [
  {
    category: 'golf-rules',
    text: `Demo Club Golf Course Rules and Penalties.
Tee times run every 10 minutes from 6:30 AM to 6:00 PM in summer (April to September) and from 7:30 AM to 4:00 PM in winter (October to March). Players must check in at the pro shop at least 15 minutes before their tee time. Players who arrive more than 10 minutes late lose their tee time and are moved to the next available slot.
Tee times can be booked up to 14 days in advance online or by calling the pro shop. Cancellations must be made at least 24 hours before the tee time, otherwise a no-show fee of $25 per player is charged.
Green fees: weekdays $45 for 18 holes and $28 for 9 holes. Weekends and public holidays $60 for 18 holes and $35 for 9 holes. Twilight rate after 3:00 PM is $30 for 18 holes. Golf cart rental is $20 per player for 18 holes.
Dress code: collared shirts are required. Denim, gym shorts and tank tops are not allowed on the course. Soft spikes only.
Pace of play: an 18-hole round should take no longer than 4 hours 15 minutes. Groups falling more than one hole behind will be asked to let faster groups play through.
Penalties: a first warning is given for slow play. A second slow-play warning results in a 2-stroke penalty in club competitions. Hitting a ball out of bounds is a 1-stroke penalty and the player must replay from the original spot. A lost ball must be searched for no longer than 3 minutes. Driving a cart off the paths when the course is closed to carts results in a $50 fine. Damaging greens or not repairing pitch marks may lead to a suspension of playing privileges.
Golf carts must stay on the paths when the course is wet. Maximum two players per cart. Drivers must be 16 or older.`,
  },
  {
    category: 'lodging-info',
    text: `Demo Club Lodge accommodation.
The lodge has 24 rooms: 16 standard rooms with a queen bed, 6 deluxe rooms with two queen beds and a balcony overlooking the 18th hole, and 2 family suites that sleep up to 6 guests.
Room rates per night: standard $129, deluxe $169, family suite $239. Rates include breakfast and free Wi-Fi.
Check-in is from 3:00 PM and check-out is by 11:00 AM. Late check-out until 1:00 PM can be requested for $25, subject to availability.
Stay and Play package: one night in a deluxe room plus 18 holes for two players with a shared cart, from $289 per night.
Pets: dogs are welcome in the 4 pet-friendly standard rooms for an extra $20 per night. Dogs must be on a leash in all public areas and on the walking trails.
Free parking is available for all lodge guests. Electric vehicle charging is available at 4 stations near the lodge entrance.`,
  },
  {
    category: 'events-info',
    text: `Events at Demo Club.
The clubhouse hosts weddings, birthday parties and corporate events. The main banquet hall seats up to 150 guests and the terrace holds up to 80 guests for outdoor receptions.
Wedding packages start at $4,500 and include the venue for 6 hours, tables and chairs, basic decorations and a dedicated event coordinator. Catering is charged separately from $45 per guest.
Corporate golf days include a shotgun start for up to 72 players, carts, a buffet lunch and prize presentation, from $95 per player.
Annual tournaments: the Spring Open is held on the second Saturday of April, the Club Championship in mid-August, and the Charity Scramble on the first Sunday of October. Members and guests can register at the pro shop up to 4 weeks before each event.
Events must be booked at least 30 days in advance with a 25% non-refundable deposit.`,
  },
  {
    category: 'contact-info',
    text: `Contact Demo Club.
Address: 100 Fairway Drive, Greenville. The club is a 10-minute drive from the town centre; follow the signs from Highway 9, exit 14.
Pro shop and tee time bookings: phone 555-0142, open daily 6:00 AM to 7:00 PM in summer and 7:00 AM to 5:00 PM in winter.
Lodge reception: phone 555-0150, open 24 hours.
Events team: email events@demoexample.com, Monday to Friday 9:00 AM to 5:00 PM.
General enquiries: email hello@demoexample.com. The clubhouse restaurant is open daily from 7:00 AM to 9:00 PM.`,
  },
  {
    category: 'real-estate-info',
    text: `Homes at Demo Club.
The Fairway Ridge community offers 40 home sites next to the golf course. Lots range from 0.25 to 0.6 acres and are priced from $85,000.
Three ready-built home designs are available: the Birdie (2 bedrooms, from $320,000), the Eagle (3 bedrooms, from $410,000) and the Albatross (4 bedrooms with a lake view, from $560,000).
Homeowners pay an HOA fee of $180 per month, which covers road maintenance, landscaping of common areas and access to the community pool.
Every home purchase includes a one-year family golf membership.
Private viewings can be booked with the sales office, open Tuesday to Saturday 10:00 AM to 4:00 PM.`,
  },
];
