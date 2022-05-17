import "./skinning/index.js";

$(function () {
    $(".sortable").sortable({
      revert: true,
      connectWith: ".sortable"
    });

    $("ul, li").disableSelection();
    $(".delete").on('click', function () { $(this).parent().remove();});
});
