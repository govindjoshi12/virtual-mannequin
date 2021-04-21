import "./skinning/index.js";

var images = ['hi', 'https://upload.wikimedia.org/wikipedia/en/a/a9/MarioNSMBUDeluxe.png', 'https://upload.wikimedia.org/wikipedia/en/7/73/Luigi_NSMBUDX.png'];

var list = document.createElement('ul');

var fragment = document.createDocumentFragment();


images.forEach(function (images) {
	var li = document.createElement('li');
	li.textContent = images;
	fragment.appendChild(li);
});

list.appendChild(fragment);

console.log(list);

var app = document.querySelector('#app');
app.appendChild(list);