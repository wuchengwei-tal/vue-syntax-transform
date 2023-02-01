export const LifeCircleHookMap = {
    beforeMount: "onBeforeMount",
    mounted: "onMounted",
    beforeUpdate: "onBeforeUpdate",
    updated: "onUpdated",
    activated: "onActivated",
    deactivated: "onDeactivated",
    beforeDestroy: "onBeforeUnmount",
    destroyed: "onUnmounted",
    beforeRouteEnter: "onBeforeRouteUpdate",
    beforeRouteLeave: "onBeforeRouteLeave",
    beforeCreate: "",
    created: "",
};

// const comment = (str, tip) => {
//     return {
//         type: "CommentBlock",
//         value: `\t------ ${str}  ${tip} --------\t`,
//     };
// };
// const leadingComment = (str) => comment(str, "start");
// const trailingComment = (str) => comment(str, "end");
