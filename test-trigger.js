fetch('http://localhost:3000/public/rsvp/test').then(res => res.text()).then(html => console.log(html)).catch(console.error);
